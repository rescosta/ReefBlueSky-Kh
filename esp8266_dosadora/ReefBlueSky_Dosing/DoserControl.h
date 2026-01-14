#ifndef DOSER_CONTROL_H
#define DOSER_CONTROL_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <time.h>

#define MAX_PUMPS 4
#define MAX_SCHEDULES 10
#define MAX_DOSE_JOBS (MAX_PUMPS * 5)

/**
 * DoserControl: Gerenciamento completo de bombas e agendas de dosagem
 */

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
  uint32_t startSecSinceMidnight;
  uint32_t endSecSinceMidnight;
  uint16_t volumePerDayMl;
};

struct DoseJob {
  uint32_t pumpId;
  uint32_t scheduleId;
  uint32_t whenEpoch;
  uint16_t volumeMl;
  bool     executed;
  uint8_t  retries;
};

struct ManualRun {
  bool     active;
  uint32_t pumpId;
  uint8_t  pumpIndex;
  uint32_t startMs;
  uint32_t durationMs;
  uint32_t scheduleId;  
  uint16_t volumeMl;
};


class DoserControl {
private:
  PumpConfig pumps[MAX_PUMPS];
  uint8_t pumpCount = 0;

  Schedule schedules[MAX_SCHEDULES];
  uint8_t scheduleCount = 0;

  DoseJob doseJobs[MAX_DOSE_JOBS];
  uint8_t doseJobCount = 0;

  ManualRun manualRun;  

  int pumpPins[MAX_PUMPS];

  uint32_t lastJobsRebuild = 0;
  uint32_t lastDailyExecuted = 0;

  typedef std::function<void(uint32_t pumpId,
                             uint16_t volumeMl,
                             uint32_t scheduleId,
                             uint32_t whenEpoch,
                             const char* status)> ExecutionCallback;
  ExecutionCallback onExecutionCallback = nullptr;

public:
  DoserControl();

  void initPins(const int pins[MAX_PUMPS]);
  void loadFromServer(const JsonDocument& config);

  void rebuildJobs(time_t now);
  void loop(time_t now);

  void startManualDose(uint8_t pumpIndex, uint16_t volumeMl, uint32_t scheduleId = 0);
  void stopManualDose(uint32_t pumpId);

  uint8_t getPumpCount() const { return pumpCount; }
  const PumpConfig& getPump(uint8_t idx) const { return pumps[idx]; }
  uint8_t getScheduleCount() const { return scheduleCount; }
  uint8_t getDoseJobCount() const { return doseJobCount; }
  const DoseJob& getDoseJob(uint8_t idx) const { return doseJobs[idx]; }

  void buildPumpsStatusJson(JsonDocument& outDoc) const;

  void onExecution(ExecutionCallback cb) { onExecutionCallback = cb; }

private:
  void runPump(int pumpIdx, uint32_t durationMs);
  void checkSchedulerTask(time_t now);
  void dosingTask(time_t now);

  uint32_t parseTimeToSeconds(const String& timeStr);
};

#endif
