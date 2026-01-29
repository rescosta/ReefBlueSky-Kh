//DoserControl.cpp
#include "DoserControl.h"
#ifdef ESP8266
  #include <LittleFS.h>
  #define SPIFFS LittleFS
#else
  #include <SPIFFS.h>
#endif

DoserControl::DoserControl() {
  manualRun.active   = false;
  manualRun.origin   = "MANUAL";
  pumpCount          = 0;
  scheduleCount      = 0;
  doseJobCount       = 0;
  lastJobsRebuild    = 0;
  lastDailyExecuted  = 0;

  for (uint8_t i = 0; i < MAX_ACTIVE_RUNS; i++) {
    activeRuns[i].inUse   = false;
    activeRuns[i].origin  = "AUTO";
  }

  lastAnyExecEpoch = 0;
  lastPumpIdExec   = 0;

}




void DoserControl::initPins(const int* pins) {
  for (uint8_t i = 0; i < MAX_PUMPS; i++) {
    pumpPins[i] = pins[i];
    pinMode(pumpPins[i], OUTPUT);
    digitalWrite(pumpPins[i], LOW);
  }
  Serial.println("[DoserControl] GPIO pins initialized");
}

void DoserControl::saveConfigToFile(const JsonDocument& config) {
  File f = SPIFFS.open("/doser_config.json", "w");
  if (!f) {
    Serial.println("[DoserControl] Falha ao abrir /doser_config.json para escrita");
    return;
  }
  serializeJson(config, f);
  f.close();
  Serial.println("[DoserControl] Config salva em /doser_config.json");
}

void DoserControl::loadFromServer(const JsonDocument& config) {
  Serial.println("[DoserControl] Carregando config do servidor...");

  if (!config.containsKey("pumps")) {
    Serial.println("[DoserControl] Nenhuma bomba na config");
    return;
  }

  JsonArrayConst pumpsArray = config["pumps"].as<JsonArrayConst>();
  pumpCount     = 0;
  scheduleCount = 0;

  for (JsonObjectConst pumpObj : pumpsArray) {
    if (pumpCount >= MAX_PUMPS) break;

    PumpConfig& pump = pumps[pumpCount];
    if (pumpObj["id"].is<const char*>()) {
      pump.id = String(pumpObj["id"].as<const char*>()).toInt();
    } else {
      pump.id = pumpObj["id"].as<uint32_t>();  // se vier numérico
    }
    pump.index              = pumpCount;
    pump.enabled = pumpObj["enabled"].isNull()
               ? true
               : pumpObj["enabled"].as<bool>();    pump.calibMlPerSec      = pumpObj["calibration_rate_ml_s"] | 1.0f;
    pump.maxDailyMl         = pumpObj["max_daily_ml"] | 100;
    pump.currentVolumeMl    = pumpObj["current_volume_ml"] | 500;
    pump.containerVolumeMl  = pumpObj["container_volume_ml"] | 500;
    pump.alarmThresholdPct  = pumpObj["alarm_threshold_pct"] | 10;
    pump.name               = pumpObj["name"].as<String>();

    Serial.printf("[DoserControl] Pump %d: %s (%.1f mL/s)\n",
                  pumpCount, pump.name.c_str(), pump.calibMlPerSec);

    // NOVO LOG:
    Serial.printf("[DoserControl]   Pump DB id=%lu index=%u\n",
                  pump.id, pump.index);


    if (pumpObj.containsKey("schedules")) {
      JsonArrayConst schedArray = pumpObj["schedules"].as<JsonArrayConst>();

      for (JsonObjectConst schedObj : schedArray) {
        if (scheduleCount >= MAX_SCHEDULES) break;

        Schedule& sched    = schedules[scheduleCount];
        sched.id           = schedObj["id"] | 0;
        sched.enabled = schedObj["enabled"].isNull()
                        ? true
                        : schedObj["enabled"].as<bool>();
        sched.daysMask     = schedObj["days_mask"] | 127;
        sched.dosesPerDay  = schedObj["doses_per_day"] | 1;
        sched.pumpIndex    = pumpCount;  

        // DEBUG: logar o valor bruto do JSON
        JsonVariantConst volVar = schedObj["volume_per_day_ml"];
        Serial.print("[DoserControl]   raw volume_per_day_ml = ");
        serializeJson(volVar, Serial);
        Serial.println();

        // volume_per_day_ml vindo como número (int/float/double)
        if (!volVar.isNull()) {
          double vol = volVar.as<double>();
          sched.volumePerDayMl = (uint16_t)vol;
        } else {
          sched.volumePerDayMl = 10;
        }

        sched.minGapMinutes  = schedObj["min_gap_minutes"] | 0;


        String startStr = schedObj["start_time"].as<String>();
        String endStr   = schedObj["end_time"].as<String>();


        sched.startSecSinceMidnight = parseTimeToSeconds(startStr);
        sched.endSecSinceMidnight   = parseTimeToSeconds(endStr);

        uint16_t volumePerDose = (sched.dosesPerDay > 0)
                                ? (sched.volumePerDayMl / sched.dosesPerDay)
                                : 0;

        Serial.printf("[DoserControl]   Schedule %d: %u doses/day, %u mL/day (~%u mL/dose), daysMask=%u\n",
                      scheduleCount,
                      (unsigned int)sched.dosesPerDay,
                      (unsigned int)sched.volumePerDayMl,
                      (unsigned int)volumePerDose,
                      sched.daysMask);


        scheduleCount++;
      }
    }

    pumpCount++;
  }

  Serial.printf("[DoserControl] Carregadas %d bombas, %d agendas\n", pumpCount, scheduleCount);

  extern int32_t g_userUtcOffsetSec;  // já está no CloudAuthDoser.cpp

  time_t nowUtc = time(nullptr);
  time_t nowUsr = nowUtc + g_userUtcOffsetSec;

  // só considera válido se já passou de um epoch "razoável"
  if (nowUsr > 1700000000) {
    Serial.printf("[DoserControl] rebuildJobs() inicial com now=%lu\n",
                  (unsigned long)nowUsr);
    rebuildJobs(nowUsr);
  } else {
    Serial.printf("[DoserControl] Horario invalido (now=%lu), adiando rebuildJobs\n",
                  (unsigned long)nowUsr);
  }


  // Persistir config local para operar offline depois
  saveConfigToFile(config);
}

void DoserControl::rebuildJobs(time_t now) {
  doseJobCount = 0;
  if (now == 0) return;

  struct tm timeinfo;
#if defined(ESP8266)
  timeinfo = *localtime(&now);
#else
  localtime_r(&now, &timeinfo);
#endif

  uint8_t  weekday       = timeinfo.tm_wday; // 0=domingo..6=sábado
  uint32_t todayMidnight = (uint32_t)now - (now % 86400);
  uint32_t nowSec        = timeinfo.tm_hour * 3600u +
                           timeinfo.tm_min  * 60u  +
                           timeinfo.tm_sec;

  Serial.printf("[DoserControl] rebuildJobs() now=%lu weekday=%u todayMidnight=%lu nowSec=%lu\n",
                (unsigned long)now,
                (unsigned int)weekday,
                (unsigned long)todayMidnight,
                (unsigned long)nowSec);

  for (uint8_t p = 0; p < pumpCount; p++) {
    if (!pumps[p].enabled) continue;

    for (uint8_t s = 0; s < scheduleCount; s++) {
      Schedule& sched = schedules[s];
      if (!sched.enabled) continue;
      if (sched.pumpIndex != p) continue;

      Serial.printf("[DoserControl]   pumpIdx=%u sched.id=%lu enabled=%u start=%u end=%u doses=%u daysMask=%u\n",
                    p,
                    (unsigned long)sched.id,
                    (unsigned int)sched.enabled,
                    sched.startSecSinceMidnight,
                    sched.endSecSinceMidnight,
                    (unsigned int)sched.dosesPerDay,
                    (unsigned int)sched.daysMask);

      uint8_t maskBit   = (1 << weekday);
      bool todayValid   = (sched.daysMask & maskBit) != 0;

      uint32_t rangeSec = 0;
      if (sched.endSecSinceMidnight > sched.startSecSinceMidnight) {
        rangeSec = sched.endSecSinceMidnight - sched.startSecSinceMidnight;
      } else if (sched.endSecSinceMidnight == sched.startSecSinceMidnight) {
        continue;
      } else {
        continue; // janela invertida, ignora
      }

      if (rangeSec == 0 || sched.dosesPerDay == 0) continue;

      uint32_t intervalPerDose = rangeSec / sched.dosesPerDay;
      uint16_t volumePerDose   = sched.volumePerDayMl / sched.dosesPerDay;

      Serial.printf("[DoserControl]   rangeSec=%lu intervalPerDose=%lu volumePerDose=%u\n",
                    (unsigned long)rangeSec,
                    (unsigned long)intervalPerDose,
                    (unsigned int)volumePerDose);

      // 1) Doses HOJE (se hoje é válido e horário ainda não passou)
      if (todayValid) {
        for (uint8_t d = 0; d < sched.dosesPerDay; d++) {
          if (doseJobCount >= MAX_DOSE_JOBS) break;

          uint32_t secSinceMidnight =
              sched.startSecSinceMidnight + (d * intervalPerDose);

          // precisa estar pelo menos 30s no futuro
          if (secSinceMidnight <= nowSec + 30) {
            continue;
          }

          uint32_t whenEpoch = todayMidnight + secSinceMidnight;

          // formata em data/hora legível
          time_t tNow  = (time_t)now;
          time_t tWhen = (time_t)whenEpoch;
          char bufNow[20];
          char bufWhen[20];
          strftime(bufNow,  sizeof(bufNow),  "%Y-%m-%d %H:%M:%S", localtime(&tNow));
          strftime(bufWhen, sizeof(bufWhen), "%Y-%m-%d %H:%M:%S", localtime(&tWhen));


          Serial.printf("[DoserControl]   TODAY job: pumpId=%lu schedId=%lu when=%s now=%s (epoch=%lu)\n",
                        pumps[p].id,
                        (unsigned long)sched.id,
                        bufWhen,
                        bufNow,
                        (unsigned long)whenEpoch);


          DoseJob& job   = doseJobs[doseJobCount];
          job.pumpId     = pumps[p].id;
          job.scheduleId = sched.id;
          job.volumeMl   = volumePerDose;
          job.whenEpoch  = whenEpoch;
          job.executed   = false;
          job.retries    = 0;
          doseJobCount++;
        }
      }

      // 2) Doses para o PRÓXIMO dia válido na máscara
      int daysAhead = 1;
      for (int d = 1; d <= 7; d++) {
        uint8_t w = (weekday + d) % 7;
        if (sched.daysMask & (1 << w)) {
          daysAhead = d;
          break;
        }
      }

      uint32_t baseMidnight = todayMidnight + (uint32_t)daysAhead * 86400u;

      for (uint8_t d = 0; d < sched.dosesPerDay; d++) {
        if (doseJobCount >= MAX_DOSE_JOBS) break;

        uint32_t secSinceMidnight =
            sched.startSecSinceMidnight + (d * intervalPerDose);

        uint32_t whenEpoch = baseMidnight + secSinceMidnight;
        time_t tWhen = (time_t)whenEpoch;
        char bufWhen[20];
        strftime(bufWhen, sizeof(bufWhen), "%Y-%m-%d %H:%M:%S", localtime(&tWhen));

        Serial.printf("[DoserControl]   NEXTDAY job: pumpId=%lu schedId=%lu when=%s (epoch=%lu, daysAhead=%d)\n",
                      pumps[p].id,
                      (unsigned long)sched.id,
                      bufWhen,
                      (unsigned long)whenEpoch,
                      daysAhead);


        DoseJob& job   = doseJobs[doseJobCount];
        job.pumpId     = pumps[p].id;
        job.scheduleId = sched.id;
        job.volumeMl   = volumePerDose;
        job.whenEpoch  = whenEpoch;
        job.executed   = false;
        job.retries    = 0;
        doseJobCount++;
      }
    }
  }

  Serial.printf("[DoserControl] Rebuilt %d dose job(s) (futuro)\n", doseJobCount);
  lastJobsRebuild = millis();
}


void DoserControl::startAutoRun(uint8_t pumpIdx, uint32_t durationMs,
                                uint32_t pumpId, uint32_t scheduleId, uint16_t volumeMl) {
  if (pumpIdx >= pumpCount) return;

  for (uint8_t i = 0; i < MAX_ACTIVE_RUNS; i++) {
    if (!activeRuns[i].inUse) {
      ActiveRun& ar = activeRuns[i];
      ar.inUse      = true;
      ar.pumpIndex  = pumpIdx;
      ar.endMs      = millis() + durationMs;
      ar.pumpId     = pumpId;
      ar.scheduleId = scheduleId;
      ar.volumeMl   = volumeMl;
      ar.origin     = "AUTO";

      digitalWrite(pumpPins[pumpIdx], HIGH);
      return;
    }
  }

  Serial.println("[DoserControl] Sem slot livre para auto-run");
}

void DoserControl::processActiveRuns(uint32_t nowMs, time_t nowSec) {
  for (uint8_t i = 0; i < MAX_ACTIVE_RUNS; i++) {
    if (!activeRuns[i].inUse) continue;

    ActiveRun& ar = activeRuns[i];
    if ((int32_t)(nowMs - ar.endMs) >= 0) {
      digitalWrite(pumpPins[ar.pumpIndex], LOW);

      if (onExecutionCallback) {
        onExecutionCallback(
          ar.pumpId,
          ar.volumeMl,
          ar.scheduleId,
          (uint32_t)nowSec,
          "OK",
          ar.origin
        );
      }
      ar.inUse = false;
    }
  }
}

void DoserControl::loop(time_t now) {
  if (now == 0) return;

  uint32_t nowMs = millis();

  // Recalcular jobs a cada 5 min (opcional)
  if (nowMs - lastJobsRebuild > 300000) {
    rebuildJobs(now);
  }

  // Dose manual em andamento (já era não-bloqueante)
  if (manualRun.active) {
    uint32_t elapsed = nowMs - manualRun.startMs;
    if (elapsed >= manualRun.durationMs) {
      digitalWrite(pumpPins[manualRun.pumpIndex], LOW);
      manualRun.active = false;

      if (onExecutionCallback) {
        time_t nowSec = time(nullptr);
        onExecutionCallback(
          manualRun.pumpId,
          manualRun.volumeMl,
          manualRun.scheduleId,
          (uint32_t)nowSec,
          "OK",               // <-- aqui é OK
          manualRun.origin    // "MANUAL"
        );
      }
    }
  }

  // Processar doses automáticas em andamento
  processActiveRuns(nowMs, now);

  // Verificar e disparar novos jobs
  for (uint8_t i = 0; i < doseJobCount; i++) {
    DoseJob& job = doseJobs[i];

    if (job.executed) continue;

    if ((uint32_t)now >= job.whenEpoch) {
      // Se existe dose em execução (auto ou manual), adia este job
      bool anyActive = manualRun.active;
      for (uint8_t k = 0; k < MAX_ACTIVE_RUNS && !anyActive; k++) {
        if (activeRuns[k].inUse) {
          anyActive = true;
        }
      }
      if (anyActive) {
        // não executa agora, não marca executed -> tenta de novo no próximo loop
        continue;
      }

      // Encontrar a bomba
      uint8_t pumpIdx = 255;
      for (uint8_t p = 0; p < pumpCount; p++) {
        if (pumps[p].id == job.pumpId) {
          pumpIdx = p;
          break;
        }
      }

      if (pumpIdx < pumpCount) {
        PumpConfig& pump = pumps[pumpIdx];

        if (!pump.enabled) {
          Serial.printf("[DoserControl] Pump %lu disabled\n", job.pumpId);
          job.executed = true;
          if (onExecutionCallback) {
            onExecutionCallback(job.pumpId, job.volumeMl, job.scheduleId,
                                job.whenEpoch, "DISABLED", "AUTO");
          }
          continue;
        }

        if (pump.currentVolumeMl < job.volumeMl) {
          Serial.printf("[DoserControl] Pump %lu: volume insuficiente\n", job.pumpId);
          job.executed = true;
          if (onExecutionCallback) {
            onExecutionCallback(job.pumpId, job.volumeMl, job.scheduleId,
                                job.whenEpoch, "LOW_VOLUME", "AUTO");
          }
          continue;
        }

        // Encontrar índice do schedule só para ler minGapMinutes
        int schedIdx = -1;
        for (uint8_t s = 0; s < scheduleCount; s++) {
          if (schedules[s].id == job.scheduleId) {
            schedIdx = s;
            break;
          }
        }

        uint32_t minGapSec = 0;
        if (schedIdx >= 0) {
          minGapSec = (uint32_t)schedules[schedIdx].minGapMinutes * 60;
        }

        // min_gap global entre bombas diferentes (apenas automáticas)
        // se a última dose foi de outra bomba, respeita minGap
        if (minGapSec > 0 &&
            lastAnyExecEpoch != 0 &&
            lastPumpIdExec != 0 &&
            lastPumpIdExec != job.pumpId &&           // bomba diferente
            (uint32_t)now < lastAnyExecEpoch + minGapSec) {
          // ainda dentro do intervalo mínimo entre bombas diferentes -> adia
          continue;
        }

        uint32_t durationMs =
          (uint32_t)((job.volumeMl / pump.calibMlPerSec) * 1000);
        Serial.printf("[DoserControl] Pump %lu: dosing %u mL for %lu ms\n",
                      job.pumpId, job.volumeMl, durationMs);

        startAutoRun(pumpIdx, durationMs, job.pumpId, job.scheduleId, job.volumeMl);

        pump.currentVolumeMl -= job.volumeMl;
        job.executed = true;

        // registra última execução automática (global)
        lastAnyExecEpoch = (uint32_t)now;
        lastPumpIdExec   = job.pumpId;
      }

    }
  }
}

void DoserControl::startManualDose(uint8_t pumpIdx, uint16_t volumeMl,
                                   uint32_t scheduleId, uint32_t pumpIdOverride) {
  if (pumpIdx >= pumpCount) return;
  PumpConfig& pump = pumps[pumpIdx];

  // Se já existe dose automática em execução, não começar manual
  for (uint8_t i = 0; i < MAX_ACTIVE_RUNS; i++) {
    if (activeRuns[i].inUse) {
      Serial.println("[DoserControl] Auto-run em andamento, bloqueando dose manual");
      return;
    }
  }

  // Se já existe manual em execução, também não iniciar outra
  if (manualRun.active) {
    Serial.println("[DoserControl] Manual em andamento, ignorando nova dose manual");
    return;
  }

  uint32_t durationMs = (uint32_t)((volumeMl / pump.calibMlPerSec) * 1000);
  digitalWrite(pumpPins[pumpIdx], HIGH);

  manualRun.active     = true;
  manualRun.pumpId     = pumpIdOverride ? pumpIdOverride : pump.id;  // ✅ usa override se vier
  manualRun.pumpIndex  = pumpIdx;
  manualRun.startMs    = millis();
  manualRun.durationMs = durationMs;
  manualRun.scheduleId = scheduleId;
  manualRun.volumeMl   = volumeMl;
  manualRun.origin     = "MANUAL";

  pump.currentVolumeMl -= volumeMl;
}

void DoserControl::stopManualDose(uint32_t pumpId) {
  if (!manualRun.active) return;
  if (manualRun.pumpId != pumpId) return;

  digitalWrite(pumpPins[manualRun.pumpIndex], LOW);
  manualRun.active = false;

  if (onExecutionCallback) {
    time_t nowSec = time(nullptr);
    onExecutionCallback(
      manualRun.pumpId,
      manualRun.volumeMl,
      manualRun.scheduleId,
      (uint32_t)nowSec,
      "ABORTED",
      manualRun.origin     
    );
  }
}


void DoserControl::buildPumpsStatusJson(JsonDocument& outDoc) const {
  JsonArray arr = outDoc.createNestedArray("pumps");

  for (uint8_t i = 0; i < pumpCount; i++) {
    JsonObject obj = arr.createNestedObject();
    obj["id"]             = pumps[i].id;
    obj["name"]           = pumps[i].name;
    obj["enabled"]        = pumps[i].enabled;
    obj["currentVolume"]  = pumps[i].currentVolumeMl;
    obj["containerVolume"] = pumps[i].containerVolumeMl;
    obj["volumePercent"]  = (pumps[i].containerVolumeMl > 0)
                            ? (pumps[i].currentVolumeMl * 100) / pumps[i].containerVolumeMl
                            : 0;
  }
}

uint32_t DoserControl::parseTimeToSeconds(const String& timeStr) {
  int colonPos = timeStr.indexOf(':');
  if (colonPos < 0) return 0;

  int hours   = timeStr.substring(0, colonPos).toInt();
  int minutes = timeStr.substring(colonPos + 1).toInt();

  return (hours * 3600) + (minutes * 60);
}

