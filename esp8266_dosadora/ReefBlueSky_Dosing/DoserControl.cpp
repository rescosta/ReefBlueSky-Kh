#include "DoserControl.h"

DoserControl::DoserControl() {
  manualRun.active   = false;
  pumpCount          = 0;
  scheduleCount      = 0;
  doseJobCount       = 0;
  lastJobsRebuild    = 0;
  lastDailyExecuted  = 0;
}

void DoserControl::initPins(const int* pins) {
  for (uint8_t i = 0; i < MAX_PUMPS; i++) {
    pumpPins[i] = pins[i];
    pinMode(pumpPins[i], OUTPUT);
    digitalWrite(pumpPins[i], LOW);
  }
  Serial.println("[DoserControl] GPIO pins initialized");
}

void DoserControl::loadFromServer(const JsonDocument& config) {
  Serial.println("[DoserControl] Carregando config do servidor...");

  // Parsear bombas (usando JsonArrayConst para v7)
  if (!config.containsKey("pumps")) {
    Serial.println("[DoserControl] Nenhuma bomba na config");
    return;
  }

  JsonArrayConst pumpsArray = config["pumps"].as<JsonArrayConst>();
  pumpCount = 0;

  for (JsonObjectConst pumpObj : pumpsArray) {
    if (pumpCount >= MAX_PUMPS) break;

    PumpConfig& pump = pumps[pumpCount];
    pump.id = pumpObj["id"] | 0;
    pump.index = pumpCount;
    pump.enabled = pumpObj["enabled"] | true;
    pump.calibMlPerSec = pumpObj["calibration_rate_ml_s"] | 1.0f;
    pump.maxDailyMl = pumpObj["max_daily_ml"] | 100;
    pump.currentVolumeMl = pumpObj["current_volume_ml"] | 500;
    pump.containerVolumeMl = pumpObj["container_volume_ml"] | 500;
    pump.alarmThresholdPct = pumpObj["alarm_threshold_pct"] | 10;
    pump.name = pumpObj["name"].as<String>();

    Serial.printf("[DoserControl] Pump %d: %s (%.1f mL/s)\n", pumpCount, pump.name.c_str(), pump.calibMlPerSec);

    // Parsear schedules (usando JsonArrayConst para v7)
    if (pumpObj.containsKey("schedules")) {
      JsonArrayConst schedArray = pumpObj["schedules"].as<JsonArrayConst>();

      for (JsonObjectConst schedObj : schedArray) {
        if (scheduleCount >= MAX_SCHEDULES) break;

        Schedule& sched = schedules[scheduleCount];
        sched.id = schedObj["id"] | 0;
        sched.enabled = schedObj["enabled"] | true;
        sched.daysMask = schedObj["days_mask"] | 127;  // seg-dom
        sched.dosesPerDay = schedObj["doses_per_day"] | 1;
        sched.volumePerDayMl = schedObj["volume_per_day_ml"] | 10;

        // Parse time strings "HH:MM"
        String startStr = schedObj["start_time"].as<String>();
        String endStr = schedObj["end_time"].as<String>();

        sched.startSecSinceMidnight = parseTimeToSeconds(startStr);
        sched.endSecSinceMidnight = parseTimeToSeconds(endStr);

        Serial.printf("[DoserControl]   Schedule %d: %d doses/day, %.0f mL/day\n",
          scheduleCount, sched.dosesPerDay, sched.volumePerDayMl);

        scheduleCount++;
      }
    }

    pumpCount++;
  }

  Serial.printf("[DoserControl] Carregadas %d bombas, %d agendas\n", pumpCount, scheduleCount);

  // Recalcular jobs para hoje
  time_t now = time(nullptr);
  rebuildJobs(now);
}

void DoserControl::rebuildJobs(time_t now) {
  doseJobCount = 0;

  for (uint8_t p = 0; p < pumpCount; p++) {
    if (!pumps[p].enabled) continue;

    for (uint8_t s = 0; s < scheduleCount; s++) {
      if (!schedules[s].enabled) continue;

      Schedule& sched = schedules[s];

      // Distribuir doses uniformemente no intervalo
      uint32_t rangeSec = sched.endSecSinceMidnight - sched.startSecSinceMidnight;
      if (rangeSec == 0) continue;

      uint32_t intervalPerDose = rangeSec / sched.dosesPerDay;
      uint16_t volumePerDose = sched.volumePerDayMl / sched.dosesPerDay;

      for (uint8_t d = 0; d < sched.dosesPerDay; d++) {
        if (doseJobCount >= MAX_DOSE_JOBS) break;

        DoseJob& job = doseJobs[doseJobCount];
        job.pumpId = pumps[p].id;
        job.scheduleId = sched.id;
        job.volumeMl = volumePerDose;
        job.executed = false;
        job.retries = 0;

        // Calcular whenEpoch (timestamp de hoje + offset de tempo)
        uint32_t secSinceMidnightToday = sched.startSecSinceMidnight + (d * intervalPerDose);
        job.whenEpoch = (uint32_t)now - (now % 86400) + secSinceMidnightToday;

        doseJobCount++;
      }
    }
  }

  Serial.printf("[DoserControl] Rebuilt %d dose job(s)\n", doseJobCount);
  lastJobsRebuild = millis();
}

void DoserControl::loop(time_t now) {
  if (now == 0) return;

  uint32_t nowMs = millis();

  // Recalcular jobs todo dia às 5 min (opcional)
  if (nowMs - lastJobsRebuild > 300000) {
    rebuildJobs(now);
  }

    // ✅ Dose manual em andamento
  if (manualRun.active) {
    uint32_t elapsed = millis() - manualRun.startMs;
    if (elapsed >= manualRun.durationMs) {
      digitalWrite(pumpPins[manualRun.pumpIndex], LOW);
      manualRun.active = false;

      if (onExecutionCallback) {
        onExecutionCallback(
          manualRun.pumpId,
          manualRun.volumeMl,
          manualRun.scheduleId,
          (uint32_t)now,
          "OK"
        );
      }
    }
  }

  // Verificar e executar jobs
  for (uint8_t i = 0; i < doseJobCount; i++) {
    DoseJob& job = doseJobs[i];

    if (job.executed) continue;

    // Se chegou na hora (ou passou)
    if (now >= job.whenEpoch) {
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

        // Validações
        if (!pump.enabled) {
          Serial.printf("[DoserControl] Pump %lu disabled\n", job.pumpId);
          job.executed = true;
          if (onExecutionCallback) {
            onExecutionCallback(job.pumpId, job.volumeMl, job.scheduleId, job.whenEpoch, "DISABLED");
          }
          continue;
        }

        if (pump.currentVolumeMl < job.volumeMl) {
          Serial.printf("[DoserControl] Pump %lu: volume insuficiente\n", job.pumpId);
          job.executed = true;
          if (onExecutionCallback) {
            onExecutionCallback(job.pumpId, job.volumeMl, job.scheduleId, job.whenEpoch, "LOW_VOLUME");
          }
          continue;
        }

        // Executar dose
        uint32_t durationMs = (uint32_t)((job.volumeMl / pump.calibMlPerSec) * 1000);
        Serial.printf("[DoserControl] Pump %lu: dosing %u mL for %lu ms\n", job.pumpId, job.volumeMl, durationMs);

        runPump(pumpIdx, durationMs);

        pump.currentVolumeMl -= job.volumeMl;
        job.executed = true;

        if (onExecutionCallback) {
          onExecutionCallback(job.pumpId, job.volumeMl, job.scheduleId, job.whenEpoch, "OK");
        }
      }
    }
  }
}

void DoserControl::startManualDose(uint8_t pumpIdx, uint16_t volumeMl, uint32_t scheduleId) {
  if (pumpIdx >= pumpCount) return;
  PumpConfig& pump = pumps[pumpIdx];

  uint32_t durationMs = (uint32_t)((volumeMl / pump.calibMlPerSec) * 1000);

  digitalWrite(pumpPins[pumpIdx], HIGH);

  manualRun.active     = true;
  manualRun.pumpId     = pump.id;
  manualRun.pumpIndex  = pumpIdx;
  manualRun.startMs    = millis();
  manualRun.durationMs = durationMs;
  manualRun.scheduleId = scheduleId;
  manualRun.volumeMl   = volumeMl;

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
      "ABORTED"
    );
  }
}

void DoserControl::runPump(int pumpIdx, uint32_t durationMs) {
  if (pumpIdx < 0 || pumpIdx >= MAX_PUMPS) return;

  digitalWrite(pumpPins[pumpIdx], HIGH);
  delay(durationMs);
  digitalWrite(pumpPins[pumpIdx], LOW);
}


void DoserControl::buildPumpsStatusJson(JsonDocument& outDoc) const {

  JsonArray arr = outDoc.createNestedArray("pumps");

  for (uint8_t i = 0; i < pumpCount; i++) {
    JsonObject obj = arr.createNestedObject();
    obj["id"] = pumps[i].id;
    obj["name"] = pumps[i].name;
    obj["enabled"] = pumps[i].enabled;
    obj["currentVolume"] = pumps[i].currentVolumeMl;
    obj["containerVolume"] = pumps[i].containerVolumeMl;
    obj["volumePercent"] = (pumps[i].currentVolumeMl * 100) / pumps[i].containerVolumeMl;
  }
}

uint32_t DoserControl::parseTimeToSeconds(const String& timeStr) {
  // Format: "HH:MM"
  int colonPos = timeStr.indexOf(':');
  if (colonPos < 0) return 0;

  int hours = timeStr.substring(0, colonPos).toInt();
  int minutes = timeStr.substring(colonPos + 1).toInt();

  return (hours * 3600) + (minutes * 60);
}

