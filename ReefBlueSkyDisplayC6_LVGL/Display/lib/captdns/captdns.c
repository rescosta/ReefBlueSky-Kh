#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "lwip/sockets.h"
#include "lwip/inet.h"
#include "captdns.h"

#define DNS_PORT    53
#define DNS_MAX_LEN 512

#pragma pack(push, 1)
typedef struct {
    uint16_t id;
    uint8_t  flags1;
    uint8_t  flags2;
    uint16_t qdcount;
    uint16_t ancount;
    uint16_t nscount;
    uint16_t arcount;
} dns_header_t;
#pragma pack(pop)

static int s_dns_sock = -1;

// 192.168.4.1
static uint32_t get_ap_ip_u32(void)
{
    return inet_addr("192.168.4.1");
}

static int build_dns_response(uint8_t *buf, int len)
{
    if (len < (int)sizeof(dns_header_t)) return 0;

    dns_header_t *hdr = (dns_header_t *)buf;
    uint8_t *p = buf + sizeof(dns_header_t);

    // pular nome da query
    while (p < buf + len && *p != 0) {
        p += (*p) + 1;
    }
    if (p + 5 > buf + len) return 0;  // 0 + QTYPE + QCLASS

    p++;                               // zero final
    uint16_t qtype  = (p[0] << 8) | p[1];
    uint16_t qclass = (p[2] << 8) | p[3];
    p += 4;

    hdr->flags1  = 0x81;
    hdr->flags2  = 0x80;
    hdr->ancount = htons(1);
    hdr->nscount = 0;
    hdr->arcount = 0;

    // ponteiro para nome original
    *p++ = 0xC0;
    *p++ = sizeof(dns_header_t);

    // TYPE / CLASS
    *p++ = (qtype >> 8) & 0xFF;
    *p++ = qtype & 0xFF;
    *p++ = (qclass >> 8) & 0xFF;
    *p++ = qclass & 0xFF;

    // TTL
    *p++ = 0x00;
    *p++ = 0x00;
    *p++ = 0x00;
    *p++ = 0x3C;

    // RDLENGTH = 4
    *p++ = 0x00;
    *p++ = 0x04;

    uint32_t ip = get_ap_ip_u32();
    uint8_t *pip = (uint8_t *)&ip;
    *p++ = pip[0];
    *p++ = pip[1];
    *p++ = pip[2];
    *p++ = pip[3];

    return (int)(p - buf);
}

static void captdns_task(void *arg)
{
    struct sockaddr_in addr, from;
    socklen_t fromlen = sizeof(from);
    uint8_t buf[DNS_MAX_LEN];

    s_dns_sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (s_dns_sock < 0) {
        vTaskDelete(NULL);
        return;
    }

    addr.sin_family      = AF_INET;
    addr.sin_port        = htons(DNS_PORT);
    addr.sin_addr.s_addr = htonl(INADDR_ANY);

    if (bind(s_dns_sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        close(s_dns_sock);
        s_dns_sock = -1;
        vTaskDelete(NULL);
        return;
    }

    while (1) {
        int len = recvfrom(s_dns_sock, buf, sizeof(buf), 0,
                           (struct sockaddr *)&from, &fromlen);
        if (len <= 0) continue;
        if (len < (int)sizeof(dns_header_t)) continue;

        dns_header_t *hdr = (dns_header_t *)buf;
        if (ntohs(hdr->qdcount) == 0) continue;

        int out_len = build_dns_response(buf, len);
        if (out_len > 0) {
            sendto(s_dns_sock, buf, out_len, 0,
                   (struct sockaddr *)&from, fromlen);
        }
    }
}

void captdnsInit(void)
{
    xTaskCreate(captdns_task, "captdns", 4096, NULL, 5, NULL);
}
