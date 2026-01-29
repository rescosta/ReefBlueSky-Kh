//AiPumpControl.cpp

#include "AiPumpControl.h"
#include "HardwarePins.h"

struct LevelState {
  float level = 50; float velocity = 0; float confidence = 0.5; unsigned long lastTime = 0;
};
LevelState levels[3];

bool aiActive = false; 
bool aiLearned = false;
int calibrationCount = 0;
Preferences aiPrefs;

// ✅ SÓ ESTA VERSÃO (DORMINDO)
void initAiPumpControl() {
  Serial.println("=== AI PUMP CONTROL v3.0 KH (DORMINDO) ===");
  aiPrefs.begin("ai", false);
  levels[0].level = aiPrefs.getFloat("r01", 50);
  levels[1].level = aiPrefs.getFloat("r02", 50);
  levels[2].level = aiPrefs.getFloat("r03", 50);
  calibrationCount = aiPrefs.getInt("calibs", 0);
  Serial.printf("📊 %d calibrações anteriores | IA DORMINDO\n", calibrationCount);
  aiPrefs.end();
  Serial.println("💤 Aguarde '5' para ativar IA!");
}

LevelState kalmanFilter(int pin, int idx) {
  static float lastRaw[3] = {50,50,50};
  float raw = analogRead(pin) / 4095.0 * 100; 
  unsigned long now = millis();
  float dt = (now - levels[idx].lastTime) / 60000.0;
  float predicted = levels[idx].level + levels[idx].velocity * dt;
  float gain = levels[idx].confidence * 0.3;
  float kalman = (1-gain) * predicted + gain * raw;
  levels[idx].level = constrain(kalman, 0, 100);
  levels[idx].velocity = (kalman - lastRaw[idx]) / 2.0;
  levels[idx].confidence = constrain(gain + 0.1, 0, 1);
  levels[idx].lastTime = now; 
  lastRaw[idx] = kalman;
  return levels[idx];
}

int getFuzzyDecision() {
  if (!aiActive || !aiLearned) {
    return 0;  // DORMINDO até '5'
  }
  
  if (levels[2].level > 95) {
    Serial.println("🚨 SAFETY C>95% - PARADO!");
    return 0;
  }
  
  kalmanFilter(LEVEL_R01_PIN, 0);
  kalmanFilter(LEVEL_R02_PIN, 1);
  kalmanFilter(LEVEL_R03_PIN, 2);
  
  int mask = 0;
  if (levels[0].level < 30) mask |= 1;
  if (levels[1].level < 20) mask |= 2;
  if (levels[2].level < 25) mask |= 4;
  if (levels[0].velocity < -5) mask |= 1;
  
  static unsigned long lastAiLevelLog = 0;
  unsigned long now = millis();
  if (now - lastAiLevelLog > 1000) { // 1 s
    lastAiLevelLog = now;
    Serial.printf("[LEVEL] A=%.0f B=%.0f C=%.0f → %d\n",
                  levels[0].level, levels[1].level, levels[2].level, mask);
  }
  return mask;

}

void calibrateAiSensors() {
  Serial.println("🔬 CALIBRAÇÃO IA 30s... (Aprendizado #" + String(++calibrationCount) + ")");
  aiActive = true;
  aiLearned = true;
  
  for(int i = 0; i < 30; i++) {
    kalmanFilter(LEVEL_R01_PIN, 0);
    kalmanFilter(LEVEL_R02_PIN, 1);
    kalmanFilter(LEVEL_R03_PIN, 2);
    delay(1000);
    Serial.printf("C%2d/30 R01=%.1f R02=%.1f R03=%.1f\r", 
                  i+1, levels[0].level, levels[1].level, levels[2].level);
  }
  
  aiPrefs.begin("ai", false);
  aiPrefs.putFloat("r01", levels[0].level);
  aiPrefs.putFloat("r02", levels[1].level);
  aiPrefs.putFloat("r03", levels[2].level);
  aiPrefs.putInt("calibs", calibrationCount);
  aiPrefs.end();
  
  Serial.println("\n🎉 IA ATIVADA! #" + String(calibrationCount) + " | [LEVEL] ATIVO!");
}

float getLevel(int reservoir) { return levels[reservoir].level; }
bool isAiActive() { return aiActive; }
