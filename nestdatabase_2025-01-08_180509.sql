-- MySQL dump 10.13  Distrib 8.0.37, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: nestdatabase
-- ------------------------------------------------------
-- Server version	8.0.37

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `filelist`
--

DROP TABLE IF EXISTS `filelist`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `filelist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `fileName` varchar(255) NOT NULL,
  `filePath` varchar(255) NOT NULL,
  `fileSize` int NOT NULL,
  `contentType` varchar(255) NOT NULL,
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=84 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `filelist`
--

/*!40000 ALTER TABLE `filelist` DISABLE KEYS */;
INSERT INTO `filelist` VALUES (7,'886bccf9-950e-46e0-9e73-013c43277ea2-888888.png','uploads\\886bccf9-950e-46e0-9e73-013c43277ea2-888888.png',105610,'image/png','2024-11-29 08:16:21.775620'),(8,'6a178ba0-131d-41f0-bbb2-4276460807b8-ç«.jpg','uploads\\6a178ba0-131d-41f0-bbb2-4276460807b8-ç«.jpg',199786,'image/jpeg','2024-11-29 09:06:18.703314'),(9,'ea2f0864-4f70-4630-9b4f-2ce049f18bb2-888888.png','uploads\\ea2f0864-4f70-4630-9b4f-2ce049f18bb2-888888.png',105610,'image/png','2024-11-29 09:16:05.910791'),(10,'4557b536-cad4-499d-9185-0adb7aa06903-888888.png','uploads\\4557b536-cad4-499d-9185-0adb7aa06903-888888.png',105610,'image/png','2024-11-29 09:16:40.721773'),(11,'fa03fb52-78ff-44c0-af26-82ef81ccf9dc-888888.png','uploads\\fa03fb52-78ff-44c0-af26-82ef81ccf9dc-888888.png',105610,'image/png','2024-11-29 09:17:02.409360'),(12,'58a32a30-a213-4713-8c82-81112e6b8cb7-888888 - å¯æ¬.png','uploads/58a32a30-a213-4713-8c82-81112e6b8cb7-888888 - å¯æ¬.png',105610,'image/png','2024-11-29 09:22:08.562837'),(13,'9eae8dee-a43c-4213-8866-86f7eb570bfe-888888 - å¯æ¬.png','uploads/9eae8dee-a43c-4213-8866-86f7eb570bfe-888888 - å¯æ¬.png',105610,'image/png','2024-11-29 09:22:56.318946'),(14,'7ee6757d-e223-41aa-8fea-2055f38ad0ef-888888 - å¯æ¬.png','uploads/7ee6757d-e223-41aa-8fea-2055f38ad0ef-888888 - å¯æ¬.png',105610,'image/png','2024-11-29 09:25:00.841312'),(15,'8b8f50cb-cdb4-4cd4-8e35-7666c3f84277-å¾®ä¿¡æªå¾_20240620175516.png','uploads/8b8f50cb-cdb4-4cd4-8e35-7666c3f84277-å¾®ä¿¡æªå¾_20240620175516.png',88847,'image/png','2024-11-29 09:34:57.839429'),(16,'68f05bf9-ca37-4ebd-9468-c00eda2d7d69-çé©¬.png','uploads/68f05bf9-ca37-4ebd-9468-c00eda2d7d69-çé©¬.png',495301,'image/png','2024-11-29 10:05:27.451375'),(17,'d34a9de4-fd3d-45cc-a52c-d8c2c143b228-å¾®ä¿¡æªå¾_20240620175516.png','uploads/d34a9de4-fd3d-45cc-a52c-d8c2c143b228-å¾®ä¿¡æªå¾_20240620175516.png',88847,'image/png','2024-12-02 07:48:31.680935'),(18,'e322ff34-22c0-4eea-b088-a8d4d68f1076-ç«.jpg','uploads/e322ff34-22c0-4eea-b088-a8d4d68f1076-ç«.jpg',199786,'image/jpeg','2024-12-02 08:03:44.350382'),(19,'7da2cd34-9a8f-47ec-8777-f503a9795006-zpsd3929.jpg','uploads/7da2cd34-9a8f-47ec-8777-f503a9795006-zpsd3929.jpg',505995,'image/jpeg','2024-12-02 08:22:38.216580'),(20,'663ef151-07a6-4d12-9671-1d9c15374a0c-ç«.jpg','uploads/663ef151-07a6-4d12-9671-1d9c15374a0c-ç«.jpg',199786,'image/jpeg','2024-12-02 08:24:41.245653'),(21,'0e4a740e-5de7-4458-985b-abab3e7baa43-888888 - å¯æ¬.png','uploads/0e4a740e-5de7-4458-985b-abab3e7baa43-888888 - å¯æ¬.png',105610,'image/png','2024-12-02 08:24:52.900995'),(22,'f46a1ab2-29ac-4047-9dfd-858e0b2bac10-888888.png','uploads/f46a1ab2-29ac-4047-9dfd-858e0b2bac10-888888.png',105610,'image/png','2024-12-03 03:00:45.518752'),(23,'25e41477-4c87-418b-a7c4-4c09e7594024-888888.png','uploads/25e41477-4c87-418b-a7c4-4c09e7594024-888888.png',105610,'image/png','2024-12-03 03:11:18.033472'),(24,'1b7fbbbd-e6b4-4118-9935-2f3571983e42-888888.png','uploads/1b7fbbbd-e6b4-4118-9935-2f3571983e42-888888.png',105610,'image/png','2024-12-03 03:28:23.245730'),(25,'7201a43e-dfd0-4306-9b8f-f60cab5f08f0-888888 - å¯æ¬.png','uploads/7201a43e-dfd0-4306-9b8f-f60cab5f08f0-888888 - å¯æ¬.png',105610,'image/png','2024-12-03 05:48:29.979287'),(26,'93efb557-ff81-4f04-80a1-522ece3623be-888888 - å¯æ¬.png','uploads/93efb557-ff81-4f04-80a1-522ece3623be-888888 - å¯æ¬.png',105610,'image/png','2024-12-03 05:49:15.013880'),(27,'3b4aae6e-89fc-4663-bd25-a29e793a51ea-888888 - å¯æ¬.png','uploads/3b4aae6e-89fc-4663-bd25-a29e793a51ea-888888 - å¯æ¬.png',105610,'image/png','2024-12-03 05:51:05.389985'),(28,'74b1ba92-7f6a-459d-8715-2888fce084f0-888888.png','uploads/74b1ba92-7f6a-459d-8715-2888fce084f0-888888.png',105610,'image/png','2024-12-03 05:52:14.512097'),(29,'909ee756-4649-46cd-aa19-1ccccb1364e5-888888.png','uploads/909ee756-4649-46cd-aa19-1ccccb1364e5-888888.png',105610,'image/png','2024-12-03 05:53:53.223069'),(30,'66f13e49-39cb-4fad-a959-e46b84ac80aa-888888 - å¯æ¬.png','uploads/66f13e49-39cb-4fad-a959-e46b84ac80aa-888888 - å¯æ¬.png',105610,'image/png','2024-12-03 05:55:44.407704'),(31,'74f384f2-d6b5-4c48-ad5f-adffb38690dd-888888.png','uploads/74f384f2-d6b5-4c48-ad5f-adffb38690dd-888888.png',105610,'image/png','2024-12-03 05:56:09.395445'),(32,'44bee506-0b74-4172-bbb7-6dd8da3f6f94-888888 - å¯æ¬.png','uploads/44bee506-0b74-4172-bbb7-6dd8da3f6f94-888888 - å¯æ¬.png',105610,'image/png','2024-12-03 06:01:56.389439'),(33,'0d65c63b-ecfd-46f4-bca4-cc6e965ae7b4-888888.png','uploads/0d65c63b-ecfd-46f4-bca4-cc6e965ae7b4-888888.png',105610,'image/png','2024-12-03 06:45:41.654321'),(34,'924fec5d-9017-4eba-b9bb-5264871f4880-20240903091018212000001IKFZH.png','uploads/924fec5d-9017-4eba-b9bb-5264871f4880-20240903091018212000001IKFZH.png',53777,'image/png','2024-12-03 09:10:09.886317'),(35,'b4594d5d-f080-4b10-86b3-99707fc3552a-888888.png','uploads/b4594d5d-f080-4b10-86b3-99707fc3552a-888888.png',105610,'image/png','2024-12-05 03:56:58.273347'),(36,'05f2ef59-630e-4d8f-9156-44bf1733cbd3-888888.png','uploads/05f2ef59-630e-4d8f-9156-44bf1733cbd3-888888.png',105610,'image/png','2024-12-05 05:38:28.604865'),(37,'2edc7e3f-0126-4630-b3c0-f3e200056cae-888888.png','uploads/2edc7e3f-0126-4630-b3c0-f3e200056cae-888888.png',105610,'image/png','2024-12-05 05:39:57.062815'),(38,'1086c37e-7bf8-4239-afbd-0272df46cf9e-888888 - å¯æ¬.png','uploads/1086c37e-7bf8-4239-afbd-0272df46cf9e-888888 - å¯æ¬.png',105610,'image/png','2024-12-05 05:41:15.512875'),(39,'efb710ad-973d-4290-bede-c52bb2c811e9-å¾®ä¿¡æªå¾_20240620175516.png','uploads/efb710ad-973d-4290-bede-c52bb2c811e9-å¾®ä¿¡æªå¾_20240620175516.png',88847,'image/png','2024-12-05 05:42:50.027401'),(40,'3e4005a4-a0f4-44df-8d0e-481dc0829bae-888888 - å¯æ¬.png','uploads/3e4005a4-a0f4-44df-8d0e-481dc0829bae-888888 - å¯æ¬.png',105610,'image/png','2024-12-05 05:55:59.603996'),(41,'62c1dae7-8aef-4064-89a2-73f53516b684-888888.png','uploads/62c1dae7-8aef-4064-89a2-73f53516b684-888888.png',105610,'image/png','2024-12-05 05:56:25.747486'),(42,'ff578e55-5d9b-4ca7-8dd5-5735c4c19ead-ç«.jpg','uploads/ff578e55-5d9b-4ca7-8dd5-5735c4c19ead-ç«.jpg',199786,'image/jpeg','2024-12-05 05:56:35.737466'),(43,'7c4f4e34-108b-43c6-86f0-507979397edf-å¾®ä¿¡æªå¾_20240620175516.png','uploads/7c4f4e34-108b-43c6-86f0-507979397edf-å¾®ä¿¡æªå¾_20240620175516.png',88847,'image/png','2024-12-05 05:58:03.262835'),(44,'f81676fb-bc4f-473b-9e36-ba95ab8b6fe0-Snipaste_2024-05-29_16-26-54.png','uploads/f81676fb-bc4f-473b-9e36-ba95ab8b6fe0-Snipaste_2024-05-29_16-26-54.png',87755,'image/png','2024-12-05 06:00:03.714676'),(45,'94ed4002-8d3d-49b0-a704-d4116e20207d-image.png','uploads/94ed4002-8d3d-49b0-a704-d4116e20207d-image.png',67413,'image/png','2024-12-05 06:00:42.984249'),(46,'a3978a58-b5e4-43cf-bb6e-6c0643f4f16e-888888.png','uploads/a3978a58-b5e4-43cf-bb6e-6c0643f4f16e-888888.png',105610,'image/png','2024-12-05 06:05:45.848880'),(47,'d997646f-7fde-4f1e-b3a1-7139b774ce27-888888.png','uploads/d997646f-7fde-4f1e-b3a1-7139b774ce27-888888.png',105610,'image/png','2024-12-05 06:10:38.486750'),(48,'c5eac8ff-886f-4dde-8b6a-e0a88482da8a-888888.png','uploads/c5eac8ff-886f-4dde-8b6a-e0a88482da8a-888888.png',105610,'image/png','2024-12-05 06:12:16.121039'),(49,'f171d00c-13a2-4f65-9265-143bdd82ddcc-ç«.jpg','uploads/f171d00c-13a2-4f65-9265-143bdd82ddcc-ç«.jpg',199786,'image/jpeg','2024-12-05 06:14:32.161407'),(50,'c8689daa-268a-4473-9073-a19fe6c0eeff-888888.png','uploads/c8689daa-268a-4473-9073-a19fe6c0eeff-888888.png',105610,'image/png','2024-12-05 06:15:04.874557'),(51,'6b074152-d5d7-4f75-9104-1e8c82f06f3e-888888 - å¯æ¬.png','uploads/6b074152-d5d7-4f75-9104-1e8c82f06f3e-888888 - å¯æ¬.png',105610,'image/png','2024-12-05 06:26:49.404812'),(52,'19587b4e-7eed-4ba3-b510-ca51e969b9e1-Snipaste_2024-05-29_16-26-54.png','uploads/19587b4e-7eed-4ba3-b510-ca51e969b9e1-Snipaste_2024-05-29_16-26-54.png',87755,'image/png','2024-12-05 06:30:48.100649'),(53,'2cedbc49-e02c-4817-9491-8cbcbf16258f-å¾®ä¿¡æªå¾_20240703180617.png','uploads/2cedbc49-e02c-4817-9491-8cbcbf16258f-å¾®ä¿¡æªå¾_20240703180617.png',56431,'image/png','2024-12-05 06:30:53.272916'),(54,'18bc3ff3-2293-4e4d-9099-03af6079ef88-å¾®ä¿¡æªå¾_20240620175516.png','uploads/18bc3ff3-2293-4e4d-9099-03af6079ef88-å¾®ä¿¡æªå¾_20240620175516.png',88847,'image/png','2024-12-05 06:31:16.879493'),(55,'147c64ab-0d53-480f-9f5c-2a904da170da-å¾®ä¿¡å¾ç_20241012110520.png','uploads/147c64ab-0d53-480f-9f5c-2a904da170da-å¾®ä¿¡å¾ç_20241012110520.png',40511,'image/png','2024-12-06 08:37:14.833910'),(56,'c6b27ba7-c79d-4416-a7e0-87ae43a61096-33 - å¯æ¬.jpg','uploads/c6b27ba7-c79d-4416-a7e0-87ae43a61096-33 - å¯æ¬.jpg',338415,'image/jpeg','2024-12-09 10:15:36.074126'),(57,'23729529-acba-459c-b8dc-3167cbf210f0-888888.png','uploads/23729529-acba-459c-b8dc-3167cbf210f0-888888.png',105610,'image/png','2024-12-09 10:15:45.464929'),(58,'4c4891e1-e2de-425e-95e2-f459f2d6e6c1-å¾®ä¿¡æªå¾_20240620175516.png','uploads/4c4891e1-e2de-425e-95e2-f459f2d6e6c1-å¾®ä¿¡æªå¾_20240620175516.png',88847,'image/png','2024-12-11 03:24:05.734465'),(59,'f63a9151-3dc7-4148-ae4d-b1d06b09fbd6-33 - å¯æ¬.jpg','uploads/f63a9151-3dc7-4148-ae4d-b1d06b09fbd6-33 - å¯æ¬.jpg',338415,'image/jpeg','2024-12-25 03:50:01.082733'),(60,'804c92b7-6e1b-450b-aad6-207f588824d7-ç«.jpg','uploads/804c92b7-6e1b-450b-aad6-207f588824d7-ç«.jpg',199786,'image/jpeg','2024-12-25 03:51:29.422557'),(61,'c74878d9-2bc8-4c19-a8e9-eb1461cbaba2-33 - å¯æ¬.jpg','uploads/c74878d9-2bc8-4c19-a8e9-eb1461cbaba2-33 - å¯æ¬.jpg',338415,'image/jpeg','2024-12-25 03:53:19.673750'),(62,'f5539364-c3dd-4233-a571-36dcd2f87ac0-888888.png','uploads/f5539364-c3dd-4233-a571-36dcd2f87ac0-888888.png',105610,'image/png','2024-12-25 03:53:57.476451'),(63,'0fc73992-4b01-412b-b579-a7be544e52fc-33 - å¯æ¬.jpg','uploads/0fc73992-4b01-412b-b579-a7be544e52fc-33 - å¯æ¬.jpg',338415,'image/jpeg','2024-12-25 03:54:41.523107'),(64,'4da31da6-a493-45ac-b97d-a0bbf951c11c-33 - å¯æ¬.jpg','uploads/4da31da6-a493-45ac-b97d-a0bbf951c11c-33 - å¯æ¬.jpg',338415,'image/jpeg','2024-12-25 03:56:00.608169'),(65,'8286b8f1-ecf9-4986-9408-983d0152fecc-33 - å¯æ¬.jpg','uploads/8286b8f1-ecf9-4986-9408-983d0152fecc-33 - å¯æ¬.jpg',338415,'image/jpeg','2024-12-25 03:57:30.675029'),(66,'b776bc0c-e9da-4677-a925-628f7d0a1c53-33 - å¯æ¬.jpg','uploads/b776bc0c-e9da-4677-a925-628f7d0a1c53-33 - å¯æ¬.jpg',338415,'image/jpeg','2024-12-25 05:35:57.121458'),(67,'d263790a-3eed-4eeb-844d-98416bdf1cec-33 - å¯æ¬.jpg','uploads/d263790a-3eed-4eeb-844d-98416bdf1cec-33 - å¯æ¬.jpg',338415,'image/jpeg','2024-12-25 05:36:17.262132'),(68,'3cc5b09c-27c8-4f8a-a8c1-13d743f05a9b-å¾®ä¿¡æªå¾_20240703180617.png','uploads/3cc5b09c-27c8-4f8a-a8c1-13d743f05a9b-å¾®ä¿¡æªå¾_20240703180617.png',56431,'image/png','2024-12-25 05:36:34.250221'),(69,'43b55f60-2c59-4deb-80ea-ea60e698f4ab-33 - å¯æ¬.jpg','uploads/43b55f60-2c59-4deb-80ea-ea60e698f4ab-33 - å¯æ¬.jpg',338415,'image/jpeg','2024-12-25 05:38:27.729559'),(70,'a40d367f-0273-49c9-83d5-8337d5faf172-33 - å¯æ¬.jpg','uploads/a40d367f-0273-49c9-83d5-8337d5faf172-33 - å¯æ¬.jpg',338415,'image/jpeg','2024-12-25 05:38:50.517547'),(71,'f13984f6-6657-4691-8288-a562ada2ca28-33 - å¯æ¬.jpg','uploads/f13984f6-6657-4691-8288-a562ada2ca28-33 - å¯æ¬.jpg',338415,'image/jpeg','2024-12-25 05:39:51.736140'),(72,'2f518f63-814b-4f8c-b020-02a5ba792d73-33 - å¯æ¬.jpg','uploads/2f518f63-814b-4f8c-b020-02a5ba792d73-33 - å¯æ¬.jpg',338415,'image/jpeg','2024-12-25 05:40:12.316698'),(73,'e1f913aa-1d34-4acf-ad9d-32ac5cc4e67f-zpsd3929.jpg','uploads/e1f913aa-1d34-4acf-ad9d-32ac5cc4e67f-zpsd3929.jpg',505995,'image/jpeg','2024-12-25 05:40:20.935354'),(74,'d21df683-feda-47df-928d-b636e77c4d52-å¾®ä¿¡æªå¾_20240703180617.png','uploads/d21df683-feda-47df-928d-b636e77c4d52-å¾®ä¿¡æªå¾_20240703180617.png',56431,'image/png','2024-12-25 05:41:59.751786'),(75,'e65dbd16-e09b-4bc7-8c94-fcb79cb90485-33 - å¯æ¬.jpg','uploads/e65dbd16-e09b-4bc7-8c94-fcb79cb90485-33 - å¯æ¬.jpg',338415,'image/jpeg','2024-12-25 05:42:14.038938'),(76,'19b5b809-32c6-47ee-8eea-3f110cb8e2ed-888888.png','uploads/19b5b809-32c6-47ee-8eea-3f110cb8e2ed-888888.png',105610,'image/png','2024-12-25 05:44:46.082209'),(77,'82440b18-3a20-4388-847e-d80e36abe3cc-33.jpg','uploads/82440b18-3a20-4388-847e-d80e36abe3cc-33.jpg',338415,'image/jpeg','2024-12-25 05:44:56.587326'),(78,'a3a3d69f-02f3-47c7-8d2b-e497505a2bea-å¾®ä¿¡å¾ç_20241012110520 (1).png','uploads/a3a3d69f-02f3-47c7-8d2b-e497505a2bea-å¾®ä¿¡å¾ç_20241012110520 (1).png',5439,'image/png','2024-12-25 05:46:04.875106'),(79,'8a0dc40a-c381-475b-ad58-c67b11a7f597-ç«.jpg','uploads/8a0dc40a-c381-475b-ad58-c67b11a7f597-ç«.jpg',199786,'image/jpeg','2024-12-26 02:48:23.923001'),(80,'bec837ab-c8be-416b-b79c-6785ce74bcc6-20240903091018212000001IKFZH.png','uploads/bec837ab-c8be-416b-b79c-6785ce74bcc6-20240903091018212000001IKFZH.png',53777,'image/png','2024-12-26 02:48:55.061375'),(81,'6104dfe3-1fb8-4eac-9475-7a93c9cb2f52-888888 - å¯æ¬.png','uploads/6104dfe3-1fb8-4eac-9475-7a93c9cb2f52-888888 - å¯æ¬.png',105610,'image/png','2024-12-26 02:50:03.712386'),(82,'7ad50f37-adac-4683-a609-290604114c43-å¾®ä¿¡å¾ç_20240726150848.jpg','uploads/7ad50f37-adac-4683-a609-290604114c43-å¾®ä¿¡å¾ç_20240726150848.jpg',913584,'image/jpeg','2024-12-26 03:09:38.786195'),(83,'ccccccccccc.png','uploads/ccccccccccc.png',633014,'image/png','2024-12-31 05:57:52.697109');
/*!40000 ALTER TABLE `filelist` ENABLE KEYS */;

--
-- Table structure for table `internal_user`
--

DROP TABLE IF EXISTS `internal_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `internal_user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  `avatar_id` int DEFAULT NULL,
  `email` varchar(255) NOT NULL,
  `age` varchar(255) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `organid` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_04fa75acbb8448b6c575464169e` (`avatar_id`),
  KEY `FK_9532fbb50136b9e43e7f6185491` (`organid`),
  CONSTRAINT `FK_04fa75acbb8448b6c575464169e` FOREIGN KEY (`avatar_id`) REFERENCES `filelist` (`id`),
  CONSTRAINT `FK_9532fbb50136b9e43e7f6185491` FOREIGN KEY (`organid`) REFERENCES `org_management` (`organid`)
) ENGINE=InnoDB AUTO_INCREMENT=52 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internal_user`
--

/*!40000 ALTER TABLE `internal_user` DISABLE KEYS */;
INSERT INTO `internal_user` VALUES (45,'xhd','邢浩东','2024-12-19 07:31:42.000000','2024-12-31 03:02:54.000000',77,'975115611@qq.com','','$2a$10$cAX3.JibP6YoAOB./0EZuO/vBxWZg.k4Eu65cC2Mw8IkMRggLx.di',8),(48,'xjx','邢景潇','2024-12-25 05:46:06.000000','2025-01-02 01:58:06.000000',78,'975115612@qq.com','','$2a$10$xeDkLXQ9PPFDGAHE1CHPreXxYSHJuOo3kwAptowJH8t/e4H/.hVRy',9),(49,'huyue','胡悦','2024-12-26 02:50:05.000000','2024-12-26 02:50:05.000000',81,'','','$2a$10$0u3ux6fQIEDU0wb2wA4/9ulMvuHngqBwSWXz8sR23pVMJs9Im5kXW',8),(50,'xingwu','邢武','2024-12-26 03:09:41.000000','2024-12-31 03:02:50.000000',82,'975115616@qq.com','','$2a$10$MMe30qOqan1wZ6Y3kOPYguTv02GckAD1PMe5Jc67n.XYx0tzvf4k.',8),(51,'xxxx','xxx','2024-12-30 09:22:26.000000','2024-12-31 05:57:53.000000',83,'','','$2a$10$nyCya5Uw4/4mo9G0WA01NeXXODGJezRoGHfxNrQG/d9jNLkKSmzt.',9);
/*!40000 ALTER TABLE `internal_user` ENABLE KEYS */;

--
-- Table structure for table `internal_user_roles_role`
--

DROP TABLE IF EXISTS `internal_user_roles_role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `internal_user_roles_role` (
  `internalUserId` int NOT NULL,
  `roleId` int NOT NULL,
  PRIMARY KEY (`internalUserId`,`roleId`),
  KEY `IDX_53aa40900f7ccd381a2d2d2b88` (`internalUserId`),
  KEY `IDX_790a23c75748f10fed39b6d697` (`roleId`),
  CONSTRAINT `FK_53aa40900f7ccd381a2d2d2b887` FOREIGN KEY (`internalUserId`) REFERENCES `internal_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_790a23c75748f10fed39b6d6978` FOREIGN KEY (`roleId`) REFERENCES `role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `internal_user_roles_role`
--

/*!40000 ALTER TABLE `internal_user_roles_role` DISABLE KEYS */;
INSERT INTO `internal_user_roles_role` VALUES (45,1),(48,2),(49,1),(49,2),(50,1),(51,3);
/*!40000 ALTER TABLE `internal_user_roles_role` ENABLE KEYS */;

--
-- Table structure for table `menu`
--

DROP TABLE IF EXISTS `menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `menu` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `url` varchar(255) DEFAULT NULL,
  `parentId` int DEFAULT NULL,
  `component` varchar(255) DEFAULT NULL,
  `icon` varchar(255) DEFAULT NULL,
  `keepalive` varchar(255) DEFAULT NULL,
  `vuepage` varchar(255) DEFAULT NULL,
  `sorts` int NOT NULL,
  `code` varchar(255) NOT NULL,
  `menutype` varchar(255) NOT NULL,
  `perms` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_23ac1b81a7bfb85b14e86bd23a5` (`parentId`),
  CONSTRAINT `FK_23ac1b81a7bfb85b14e86bd23a5` FOREIGN KEY (`parentId`) REFERENCES `menu` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=45 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `menu`
--

/*!40000 ALTER TABLE `menu` DISABLE KEYS */;
INSERT INTO `menu` VALUES (21,'系统设置','',NULL,'','Setting','1','',2,'xtsz','1',''),(25,'角色管理','roleManagement',21,'systemSetting/roleManagement','Grid','1','',1,'roleManagement','1',''),(26,'员工管理','internalusers',21,'systemSetting/internalusers','User','0','',2,'internalusers','1',''),(33,'组织架构','management',21,'systemSetting/management','Check','1','',3,'management','1',''),(34,'资源管理','menuResource',21,'systemSetting/menuResource','Goods','0','',0,'resourceManagement','1',''),(44,'新增用户','',26,'','','1',NULL,1,'adduser','2','add:user');
/*!40000 ALTER TABLE `menu` ENABLE KEYS */;

--
-- Table structure for table `org_management`
--

DROP TABLE IF EXISTS `org_management`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `org_management` (
  `organid` int NOT NULL AUTO_INCREMENT,
  `parentId` int DEFAULT NULL,
  `organame` varchar(255) NOT NULL,
  `orgcode` varchar(255) NOT NULL,
  PRIMARY KEY (`organid`),
  KEY `FK_19de0ec55c78cb2fbb5d3c5bd74` (`parentId`),
  CONSTRAINT `FK_19de0ec55c78cb2fbb5d3c5bd74` FOREIGN KEY (`parentId`) REFERENCES `org_management` (`organid`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `org_management`
--

/*!40000 ALTER TABLE `org_management` DISABLE KEYS */;
INSERT INTO `org_management` VALUES (8,NULL,'top1','top1'),(9,8,'top1-1','top1-1');
/*!40000 ALTER TABLE `org_management` ENABLE KEYS */;

--
-- Table structure for table `role`
--

DROP TABLE IF EXISTS `role`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `states` int NOT NULL,
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role`
--

/*!40000 ALTER TABLE `role` DISABLE KEYS */;
INSERT INTO `role` VALUES (1,'超级管理员',1,'2024-12-13 09:09:39.814697','2024-12-17 02:32:25.000000'),(2,'管理员',1,'2024-12-17 02:21:52.883397','2024-12-18 02:49:47.000000'),(3,'普通角色',1,'2024-12-17 03:04:58.416076','2024-12-17 03:04:58.416076'),(4,'失效2154',0,'2024-12-17 07:36:00.478292','2024-12-25 07:23:29.000000'),(9,'水电费水电费',0,'2024-12-25 07:23:32.886308','2024-12-25 07:23:32.886308'),(10,'2563563',0,'2024-12-26 02:38:44.000000','2024-12-31 08:52:25.000000');
/*!40000 ALTER TABLE `role` ENABLE KEYS */;

--
-- Table structure for table `role_menus_menu`
--

DROP TABLE IF EXISTS `role_menus_menu`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_menus_menu` (
  `roleId` int NOT NULL,
  `menuId` int NOT NULL,
  PRIMARY KEY (`roleId`,`menuId`),
  KEY `IDX_eec9c5cb17157b2294fd9f0edb` (`roleId`),
  KEY `IDX_f1adc6be166630ee2476d7bbf0` (`menuId`),
  CONSTRAINT `FK_eec9c5cb17157b2294fd9f0edbf` FOREIGN KEY (`roleId`) REFERENCES `role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_f1adc6be166630ee2476d7bbf09` FOREIGN KEY (`menuId`) REFERENCES `menu` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role_menus_menu`
--

/*!40000 ALTER TABLE `role_menus_menu` DISABLE KEYS */;
INSERT INTO `role_menus_menu` VALUES (1,21),(1,25),(1,26),(1,33),(1,34),(1,44),(2,21),(2,26),(2,33);
/*!40000 ALTER TABLE `role_menus_menu` ENABLE KEYS */;

--
-- Table structure for table `role_users_internal_user`
--

DROP TABLE IF EXISTS `role_users_internal_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_users_internal_user` (
  `roleId` int NOT NULL,
  `internalUserId` int NOT NULL,
  PRIMARY KEY (`roleId`,`internalUserId`),
  KEY `IDX_0fc0bc47460c8733b625da5e8a` (`roleId`),
  KEY `IDX_b3d5617c902f64759768e5d848` (`internalUserId`),
  CONSTRAINT `FK_0fc0bc47460c8733b625da5e8a5` FOREIGN KEY (`roleId`) REFERENCES `role` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FK_b3d5617c902f64759768e5d848f` FOREIGN KEY (`internalUserId`) REFERENCES `internal_user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role_users_internal_user`
--

/*!40000 ALTER TABLE `role_users_internal_user` DISABLE KEYS */;
/*!40000 ALTER TABLE `role_users_internal_user` ENABLE KEYS */;

--
-- Dumping routines for database 'nestdatabase'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-01-08 18:05:25
