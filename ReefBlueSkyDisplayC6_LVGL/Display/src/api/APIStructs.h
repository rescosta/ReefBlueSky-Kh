// src/api/APIStructs.h
#ifndef APISTRUCTS_H
#define APISTRUCTS_H

struct KHData {
    float kh;
    float min;
    float max;
    float var;
    float temperature;
    uint32_t timestamp;
    char status[20];
    float confidence;
};

#endif
