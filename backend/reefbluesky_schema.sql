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
-- Table structure for table `device_alerts`
--

DROP TABLE IF EXISTS `device_alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_alerts` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `deviceId` varchar(50) NOT NULL,
  `userId` int(11) NOT NULL,
  `type` varchar(100) NOT NULL,
  `message` text NOT NULL,
  `severity` enum('low','medium','high','critical') DEFAULT 'medium',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_deviceId_created` (`deviceId`,`created_at` DESC),
  KEY `idx_userId` (`userId`)
) ENGINE=InnoDB AUTO_INCREMENT=38 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

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
  `processed` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_device_status` (`deviceId`,`status`,`createdAt`)
) ENGINE=InnoDB AUTO_INCREMENT=468 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB AUTO_INCREMENT=29456 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_logs`
--

DROP TABLE IF EXISTS `device_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_logs` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `deviceId` varchar(64) NOT NULL,
  `userId` bigint(20) unsigned DEFAULT NULL,
  `ts` bigint(20) NOT NULL,
  `level` varchar(16) DEFAULT NULL,
  `message` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_device_ts` (`deviceId`,`ts` DESC),
  KEY `idx_user_ts` (`userId`,`ts` DESC)
) ENGINE=InnoDB AUTO_INCREMENT=23993 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `device_ota_events`
--

DROP TABLE IF EXISTS `device_ota_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_ota_events` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `device_id` bigint(20) DEFAULT NULL,
  `device_type` varchar(20) DEFAULT NULL,
  `event_type` varchar(50) DEFAULT NULL,
  `firmware_version` varchar(100) DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `timestamp` datetime DEFAULT current_timestamp(),
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_timestamp` (`timestamp`),
  KEY `idx_event_type` (`event_type`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `devicecommands`
--

DROP TABLE IF EXISTS `devicecommands`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `devicecommands` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `deviceId` varchar(64) NOT NULL,
  `type` varchar(64) NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `status` enum('pending','inprogress','done','failed') NOT NULL DEFAULT 'pending',
  `errorMessage` varchar(255) DEFAULT NULL,
  `createdAt` datetime NOT NULL DEFAULT current_timestamp(),
  `updatedAt` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_device_status_createdAt` (`deviceId`,`status`,`createdAt`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
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
  `mainDeviceId` varchar(64) DEFAULT NULL,
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
  `type` enum('KH','LCD','DOSER') NOT NULL,
  `lcd_offline_alert_sent` tinyint(1) NOT NULL DEFAULT 0,
  `parentDeviceId` varchar(50) DEFAULT NULL,
  `dosing_status` varchar(16) DEFAULT NULL,
  `firmware_version` varchar(32) DEFAULT NULL,
  `sensor_data` text DEFAULT NULL,
  `test_mode` tinyint(1) DEFAULT 0,
  `testMode` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_devices_deviceId` (`deviceId`),
  KEY `idx_devices_userId` (`userId`),
  KEY `idx_devices_mainDeviceId` (`mainDeviceId`),
  CONSTRAINT `fk_devices_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=862 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `display_commands`
--

DROP TABLE IF EXISTS `display_commands`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `display_commands` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `displayId` varchar(64) NOT NULL,
  `action` varchar(32) NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload`)),
  `createdAt` datetime NOT NULL DEFAULT current_timestamp(),
  `consumedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_display_commands_displayId_createdAt` (`displayId`,`createdAt`),
  KEY `idx_display_commands_displayId_consumed` (`displayId`,`consumedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dosing_alerts`
--

DROP TABLE IF EXISTS `dosing_alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `dosing_alerts` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `device_id` bigint(20) unsigned DEFAULT NULL,
  `pump_id` bigint(20) unsigned DEFAULT NULL,
  `type` enum('DEVICE_OFFLINE','CONTAINER_LOW','OVERDOSE','POWER_FAIL','PUMP_ERROR') NOT NULL,
  `message` varchar(255) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `resolved_at` datetime DEFAULT NULL,
  `notified_email` tinyint(1) DEFAULT 0,
  `notified_telegram` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `fk_alert_device` (`device_id`),
  KEY `fk_alert_pump` (`pump_id`),
  KEY `idx_user_type` (`user_id`,`type`,`created_at`),
  KEY `idx_unresolved` (`user_id`,`resolved_at`),
  KEY `idx_dosing_alert_user` (`user_id`,`created_at` DESC),
  CONSTRAINT `fk_alert_device` FOREIGN KEY (`device_id`) REFERENCES `dosing_devices` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_alert_pump` FOREIGN KEY (`pump_id`) REFERENCES `dosing_pumps` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_alert_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dosing_devices`
--

DROP TABLE IF EXISTS `dosing_devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `dosing_devices` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int(10) unsigned NOT NULL,
  `name` varchar(64) NOT NULL DEFAULT 'Dosadora Balling',
  `hw_type` enum('ESP8266','ESP32') NOT NULL DEFAULT 'ESP8266',
  `esp_uid` varchar(64) NOT NULL,
  `firmware_version` varchar(32) NOT NULL DEFAULT '1.0.0',
  `timezone` varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
  `last_seen` datetime DEFAULT NULL,
  `online` tinyint(1) NOT NULL DEFAULT 0,
  `last_ip` varchar(45) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `offline_alert_sent` tinyint(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `esp_uid` (`esp_uid`),
  KEY `idx_user_online` (`user_id`,`online`,`last_seen`),
  KEY `idx_dosing_device_user_online` (`user_id`,`online`,`last_seen` DESC),
  KEY `idx_dosing_offline` (`offline_alert_sent`),
  CONSTRAINT `fk_doser_device_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dosing_executions`
--

DROP TABLE IF EXISTS `dosing_executions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `dosing_executions` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pump_id` bigint(20) unsigned NOT NULL,
  `schedule_id` bigint(20) unsigned DEFAULT NULL,
  `scheduled_at` datetime NOT NULL,
  `executed_at` datetime DEFAULT NULL,
  `volume_ml` int(10) unsigned NOT NULL,
  `status` enum('PENDING','OK','SKIPPED','FAILED') NOT NULL DEFAULT 'PENDING',
  `error_code` varchar(32) DEFAULT NULL,
  `origin` enum('AUTO','MANUAL') NOT NULL DEFAULT 'AUTO',
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `fk_exec_schedule` (`schedule_id`),
  KEY `idx_pump_scheduled` (`pump_id`,`scheduled_at`),
  KEY `idx_pump_status` (`pump_id`,`status`,`created_at`),
  KEY `idx_dosing_exec_pump_date` (`pump_id`,`scheduled_at` DESC),
  CONSTRAINT `fk_exec_pump` FOREIGN KEY (`pump_id`) REFERENCES `dosing_pumps` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exec_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `dosing_schedules` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=261 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dosing_pumps`
--

DROP TABLE IF EXISTS `dosing_pumps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `dosing_pumps` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `device_id` bigint(20) unsigned NOT NULL,
  `name` varchar(64) NOT NULL,
  `index_on_device` tinyint(3) unsigned NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `container_volume_ml` int(10) unsigned NOT NULL DEFAULT 500,
  `current_volume_ml` int(10) unsigned NOT NULL DEFAULT 500,
  `alarm_threshold_pct` tinyint(3) unsigned NOT NULL DEFAULT 10,
  `calibration_rate_ml_s` decimal(8,3) NOT NULL DEFAULT 1.000,
  `max_daily_ml` int(10) unsigned NOT NULL DEFAULT 1000,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_device_index` (`device_id`,`index_on_device`),
  KEY `idx_pump_enabled` (`device_id`,`enabled`),
  KEY `idx_dosing_pump_device` (`device_id`,`enabled`),
  CONSTRAINT `fk_pump_device` FOREIGN KEY (`device_id`) REFERENCES `dosing_devices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `dosing_schedules`
--

DROP TABLE IF EXISTS `dosing_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `dosing_schedules` (
  `id` bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  `pump_id` bigint(20) unsigned NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `days_mask` tinyint(3) unsigned NOT NULL DEFAULT 127,
  `doses_per_day` tinyint(3) unsigned NOT NULL DEFAULT 1,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `volume_per_day_ml` int(10) unsigned NOT NULL DEFAULT 36,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `min_gap_minutes` int(11) DEFAULT 30,
  `adjusted_times` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`adjusted_times`)),
  `notify_telegram` tinyint(1) DEFAULT 0,
  `notify_email` tinyint(1) DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `idx_pump_enabled` (`pump_id`,`enabled`),
  CONSTRAINT `fk_schedule_pump` FOREIGN KEY (`pump_id`) REFERENCES `dosing_pumps` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=94 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `kh_test_schedule`
--

DROP TABLE IF EXISTS `kh_test_schedule`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `kh_test_schedule` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `deviceId` varchar(50) NOT NULL,
  `interval_hours` int(11) NOT NULL DEFAULT 24,
  `next_test_time` bigint(20) DEFAULT NULL,
  `last_test_time` bigint(20) DEFAULT NULL,
  `last_test_status` enum('pending','running','success','error') DEFAULT 'pending',
  `last_test_error` text DEFAULT NULL,
  `auto_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_device` (`deviceId`),
  KEY `idx_next_test` (`next_test_time`,`auto_enabled`),
  KEY `idx_pending_tests` (`auto_enabled`,`next_test_time`,`last_test_status`),
  CONSTRAINT `fk_test_schedule_device` FOREIGN KEY (`deviceId`) REFERENCES `devices` (`deviceId`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
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
  `startedAt` bigint(20) DEFAULT NULL,
  `finishedAt` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_measurements_device_ts` (`deviceId`,`timestamp`)
) ENGINE=InnoDB AUTO_INCREMENT=166 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
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
  `telegram_chat_id` bigint(20) DEFAULT NULL,
  `telegram_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `telegram_bot_token` varchar(100) DEFAULT NULL,
  `name` varchar(191) DEFAULT NULL,
  `timezone` varchar(64) DEFAULT NULL,
  `email_enabled` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary table structure for view `vw_dosing_status`
--

DROP TABLE IF EXISTS `vw_dosing_status`;
/*!50001 DROP VIEW IF EXISTS `vw_dosing_status`*/;
SET @saved_cs_client     = @@character_set_client;
SET character_set_client = utf8mb4;
/*!50001 CREATE VIEW `vw_dosing_status` AS SELECT
 1 AS `device_id`,
  1 AS `user_id`,
  1 AS `device_name`,
  1 AS `online`,
  1 AS `last_seen`,
  1 AS `pump_count`,
  1 AS `pumps_enabled`,
  1 AS `pumps_low`,
  1 AS `alert_count` */;
SET character_set_client = @saved_cs_client;

--
-- Final view structure for view `vw_dosing_status`
--

/*!50001 DROP VIEW IF EXISTS `vw_dosing_status`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb3 */;
/*!50001 SET character_set_results     = utf8mb3 */;
/*!50001 SET collation_connection      = utf8mb3_general_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`reefapp`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `vw_dosing_status` AS select `d`.`id` AS `device_id`,`d`.`user_id` AS `user_id`,`d`.`name` AS `device_name`,`d`.`online` AS `online`,`d`.`last_seen` AS `last_seen`,count(`p`.`id`) AS `pump_count`,sum(case when `p`.`enabled` = 1 then 1 else 0 end) AS `pumps_enabled`,sum(case when `p`.`current_volume_ml` <= `p`.`container_volume_ml` * `p`.`alarm_threshold_pct` / 100 then 1 else 0 end) AS `pumps_low`,sum(case when `a`.`resolved_at` is null then 1 else 0 end) AS `alert_count` from ((`dosing_devices` `d` left join `dosing_pumps` `p` on(`d`.`id` = `p`.`device_id`)) left join `dosing_alerts` `a` on(`a`.`device_id` = `d`.`id` or `a`.`pump_id` = `p`.`id`)) group by `d`.`id` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-02 20:11:29
