/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.14-MariaDB, for debian-linux-gnu (aarch64)
--
-- Host: localhost    Database: reefbluesky
-- ------------------------------------------------------
-- Server version	10.11.14-MariaDB-0+deb12u2

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `device_commands`
--

DROP TABLE IF EXISTS `device_commands`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_commands` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `deviceId` varchar(64) NOT NULL,
  `type` varchar(50) NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `status` enum('pending','inprogress','sent','done','error') NOT NULL DEFAULT 'pending',
  `errorMessage` text DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT current_timestamp(),
  `updatedAt` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_device_status` (`deviceId`,`status`,`createdAt`)
) ENGINE=InnoDB AUTO_INCREMENT=75 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_events`
--

DROP TABLE IF EXISTS `device_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_events` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `deviceId` varchar(64) NOT NULL,
  `userId` bigint(20) unsigned NOT NULL,
  `timestamp` datetime NOT NULL,
  `level` varchar(20) NOT NULL,
  `type` varchar(50) NOT NULL,
  `message` text NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_dev_user_ts` (`deviceId`,`userId`,`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_health`
--

DROP TABLE IF EXISTS `device_health`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_health` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `deviceId` varchar(64) NOT NULL,
  `userId` bigint(20) unsigned NOT NULL,
  `cpu_usage` decimal(5,2) DEFAULT NULL,
  `mem_usage` decimal(5,2) DEFAULT NULL,
  `storage_usage` decimal(5,2) DEFAULT NULL,
  `wifi_rssi` int(11) DEFAULT NULL,
  `uptime_seconds` int(11) DEFAULT NULL,
  `updatedAt` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_dev_user` (`deviceId`,`userId`,`updatedAt`)
) ENGINE=InnoDB AUTO_INCREMENT=219 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_status`
--

DROP TABLE IF EXISTS `device_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_status` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `deviceId` varchar(64) NOT NULL,
  `userId` bigint(20) unsigned NOT NULL,
  `interval_hours` int(11) DEFAULT NULL,
  `level_a` tinyint(1) DEFAULT 0,
  `level_b` tinyint(1) DEFAULT 0,
  `level_c` tinyint(1) DEFAULT 0,
  `pump1_running` tinyint(1) DEFAULT 0,
  `pump1_direction` varchar(10) DEFAULT 'forward',
  `pump2_running` tinyint(1) DEFAULT 0,
  `pump2_direction` varchar(10) DEFAULT 'forward',
  `pump3_running` tinyint(1) DEFAULT 0,
  `pump3_direction` varchar(10) DEFAULT 'forward',
  `updatedAt` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_dev_user` (`deviceId`,`userId`,`updatedAt`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `devices`
--

DROP TABLE IF EXISTS `devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `devices` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `deviceId` varchar(50) NOT NULL,
  `userId` int(10) unsigned DEFAULT 1,
  `name` varchar(100) DEFAULT NULL,
  `local_ip` varchar(45) DEFAULT NULL,
  `last_seen` datetime DEFAULT NULL,
  `lcd_last_seen` bigint(20) DEFAULT NULL,
  `lcd_status` varchar(16) NOT NULL DEFAULT 'offline',
  `offline_alert_sent` tinyint(1) NOT NULL DEFAULT 0,
  `khreference` float DEFAULT NULL,
  `khtarget` float DEFAULT NULL,
  `interval_minutes` int(11) DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT current_timestamp(),
  `updatedAt` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `kh_target` decimal(4,2) DEFAULT NULL,
  `kh_reference` decimal(4,2) DEFAULT NULL,
  `kh_tolerance_daily` decimal(4,2) DEFAULT NULL,
  `kh_alert_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `kh_alert_channel` varchar(50) DEFAULT NULL,
  `pump4_ml_per_sec` decimal(8,4) DEFAULT NULL,
  `kh_health_green_max_dev` decimal(5,2) DEFAULT NULL,
  `kh_health_yellow_max_dev` decimal(5,2) DEFAULT NULL,
  `kh_auto_enabled` tinyint(1) DEFAULT NULL,
  `type` varchar(10) NOT NULL DEFAULT 'KH',
  `lcd_offline_alert_sent` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_devices_deviceId` (`deviceId`),
  KEY `idx_devices_userId` (`userId`),
  CONSTRAINT `fk_devices_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=188 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `measurements`
--

DROP TABLE IF EXISTS `measurements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `measurements` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `deviceId` varchar(50) NOT NULL,
  `kh` float NOT NULL,
  `phref` float DEFAULT NULL,
  `phsample` float DEFAULT NULL,
  `temperature` float DEFAULT NULL,
  `timestamp` bigint(20) NOT NULL,
  `status` varchar(20) DEFAULT NULL,
  `confidence` float DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_measurements_device_ts` (`deviceId`,`timestamp`)
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `passwordHash` varchar(255) NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `verificationCode` varchar(6) DEFAULT NULL,
  `verificationExpiresAt` datetime DEFAULT NULL,
  `isVerified` tinyint(1) NOT NULL DEFAULT 0,
  `role` varchar(50) NOT NULL DEFAULT 'user',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-12-21 18:32:51