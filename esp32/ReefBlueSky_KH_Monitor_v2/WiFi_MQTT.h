#ifndef WIFI_MQTT_H
#define WIFI_MQTT_H

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>

/**
 * @class WiFi_MQTT
 * @brief Gerenciador de conectividade WiFi e MQTT
 */
class WiFi_MQTT {
public:
    /**
     * Construtor
     * @param ssid Nome da rede WiFi
     * @param password Senha da rede WiFi
     * @param mqtt_server IP do broker MQTT
     * @param mqtt_port Porta do broker MQTT (padrão: 1883)
     */
    WiFi_MQTT(const char* ssid, const char* password, const char* mqtt_server, int mqtt_port = 1883);

    /**
     * Inicializar WiFi e MQTT
     */
    void begin();

    /**
     * Conectar ao WiFi
     * @return true se conectado com sucesso
     */
    bool connectWiFi();

    /**
     * Conectar ao broker MQTT
     * @return true se conectado com sucesso
     */
    bool connectMQTT();

    /**
     * Processar conexão (manter viva)
     */
    void loop();

    /**
     * Publicar mensagem MQTT
     * @param topic Tópico MQTT
     * @param message Mensagem a publicar
     * @return true se publicado com sucesso
     */
    bool publish(const char* topic, const char* message);

    /**
     * Publicar valor float como JSON
     * @param topic Tópico MQTT
     * @param value Valor a publicar
     */
    void publishFloat(const char* topic, float value);

    /**
     * Publicar valor int como JSON
     * @param topic Tópico MQTT
     * @param value Valor a publicar
     */
    void publishInt(const char* topic, int value);

    /**
     * Inscrever em tópico
     * @param topic Tópico MQTT
     */
    void subscribe(const char* topic);

    /**
     * Verificar se está conectado ao WiFi
     * @return true se conectado
     */
    bool isWiFiConnected();

    /**
     * Verificar se está conectado ao MQTT
     * @return true se conectado
     */
    bool isMQTTConnected();

    /**
     * Obter força do sinal WiFi (RSSI)
     * @return RSSI em dBm
     */
    int getRSSI();

    /**
     * Definir callback para mensagens recebidas
     * @param callback Função callback
     */
    void setMessageCallback(void (*callback)(char*, uint8_t*, unsigned int));

private:
    // Credenciais
    const char* _ssid;
    const char* _password;
    const char* _mqtt_server;
    int _mqtt_port;

    // Clientes
    WiFiClient _wifiClient;
    PubSubClient _mqttClient;

    // Estado
    unsigned long _last_reconnect_attempt;
    static const unsigned long RECONNECT_INTERVAL = 5000;  // 5 segundos

    // Métodos privados
    void setupWiFi();
    void reconnect();
    void logWiFiStatus();
};

#endif // WIFI_MQTT_H
