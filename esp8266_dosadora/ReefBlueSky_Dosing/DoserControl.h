//DoserControl.h
#ifndef DOSER_CONTROL_H
#define DOSER_CONTROL_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <time.h>

#define MAX_PUMPS      6
#define MAX_SCHEDULES 10
#define MAX_DOSE_JOBS 300  // [FIX] Suporta 24 doses/dia × 6 bombas × 2 dias = 288 jobs + margem
#define MAX_ACTIVE_RUNS MAX_PUMPS

struct PumpConfig {
  uint32_t id;
  uint8_t  index;
  bool     enabled;
  float    calibMlPerSec;
  uint16_t maxDailyMl;
  uint16_t currentVolumeMl;
  uint16_t containerVolumeMl;
  uint8_t  alarmThresholdPct;
  String   name;
};

struct Schedule {
  uint32_t id;
  bool     enabled;
  uint8_t  daysMask;
  uint8_t  dosesPerDay;
  float volumePerDayMl;
  uint16_t minGapMinutes;
  uint32_t startSecSinceMidnight;
  uint32_t endSecSinceMidnight;
  uint8_t  pumpIndex;
  // Horários ajustados pelo backend (em segundos desde meia-noite)
  uint32_t adjustedTimes[24];  // Máximo 24 doses por dia
  uint8_t  adjustedTimesCount;
  // [FIX] Volumes individuais por dose (backend calcula para garantir total exato)
  float doseVolumes[24];  // Volume específico de cada dose
  uint8_t  doseVolumesCount;
};


struct DoseJob {
  uint32_t pumpId;
  uint32_t scheduleId;
  uint32_t whenEpoch;
  float volumeMl;
  bool     executed;
  uint8_t  retries;
  uint16_t minGapSec;  // [NOVO] Intervalo mínimo entre bombas (segundos)
  uint8_t  doseIndex;   // [NOVO] 1..dosesPerDay (posição da dose na schedule)

};

struct ManualRun {
  bool     active;
  uint32_t pumpId;
  uint8_t  pumpIndex;
  uint32_t startMs;
  uint32_t durationMs;
  uint32_t scheduleId;
  float volumeMl;
  const char* origin;
};

struct ActiveRun {
  bool     inUse;
  uint8_t  pumpIndex;
  uint32_t endMs;
  uint32_t pumpId;
  uint32_t scheduleId;
  float volumeMl;
  const char* origin;
  uint8_t  doseIndex;   

};

struct LastDoseInfo {
  uint32_t lastEpoch;
  uint8_t  lastDoseIndex;
};


class DoserControl {
private:
  PumpConfig pumps[MAX_PUMPS];
  uint8_t    pumpCount = 0;

  Schedule schedules[MAX_SCHEDULES];
  uint8_t  scheduleCount = 0;

  DoseJob  doseJobs[MAX_DOSE_JOBS];
  uint8_t  doseJobCount = 0;

  ManualRun manualRun;
  ActiveRun activeRuns[MAX_ACTIVE_RUNS];

  int       pumpPins[MAX_PUMPS];

  LastDoseInfo lastAutoDose[MAX_PUMPS];


  uint32_t lastAnyExecEpoch = 0;    // horário da última dose automática (qualquer bomba)
  uint32_t lastPumpIdExec   = 0;    // pumpId da última dose automática

  uint32_t  lastJobsRebuild = 0;
  uint32_t  lastDailyExecuted = 0;

  typedef std::function<void(uint32_t pumpId,
                            float volumeMl,
                            uint32_t scheduleId,
                            uint32_t whenEpoch,
                            const char* status,
                            const char* origin,
                            uint8_t doseIndex)> ExecutionCallback; 


  ExecutionCallback onExecutionCallback = nullptr;

public:
  DoserControl();

  void initPins(const int pins[MAX_PUMPS]);
  void loadFromServer(const JsonDocument& config);

  void rebuildJobs(time_t now);
  void loop(time_t now);

  void startManualDose(uint8_t pumpIdx, float volumeMl,
                     uint32_t scheduleId, uint32_t pumpIdOverride = 0);
  void stopManualDose(uint32_t pumpId);

  uint8_t        getPumpCount() const { return pumpCount; }
  const PumpConfig& getPump(uint8_t idx) const { return pumps[idx]; }
  uint8_t        getScheduleCount() const { return scheduleCount; }
  uint8_t        getDoseJobCount() const { return doseJobCount; }
  const DoseJob& getDoseJob(uint8_t idx) const { return doseJobs[idx]; }

  void buildPumpsStatusJson(JsonDocument& outDoc) const;

  void onExecution(ExecutionCallback cb) { onExecutionCallback = cb; }

private:
  uint32_t parseTimeToSeconds(const String& timeStr);
  void     startAutoRun(uint8_t pumpIdx, uint32_t durationMs,
                        uint32_t pumpId, uint32_t scheduleId, float volumeMl, uint8_t doseIndex);
  void     processActiveRuns(uint32_t nowMs, time_t nowSec);
  void     resolveTimeConflicts();  // [NOVO] Escalonar jobs com horários conflitantes

  bool     canStartAutoDose(uint8_t pumpIdx, uint8_t doseIndex, uint32_t nowEpoch); // ✅ NOVA

  void     saveConfigToFile(const JsonDocument& config);
};

#endif

