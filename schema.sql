/*
 Navicat Premium Data Transfer

 Source Server         : 11
 Source Server Type    : SQLite
 Source Server Version : 3035005
 Source Schema         : main

 Target Server Type    : SQLite
 Target Server Version : 3035005
 File Encoding         : 65001

 Date: 24/01/2024 18:01:09
*/

PRAGMA foreign_keys = false;


-- ----------------------------
-- Table structure for tb_user
-- ----------------------------
DROP TABLE IF EXISTS "tb_user";
CREATE TABLE "tb_user" (
                           "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                           "username" TEXT NOT NULL,
                           "password" TEXT NOT NULL,
                           "salt" TEXT NOT NULL,
                           "nick_name" TEXT NOT NULL,
                           "gender" integer,
                           "avatar_path" TEXT,
                           "signature" TEXT,
                           "created_time" integer NOT NULL,
                           "locked" integer NOT NULL DEFAULT 0
);


PRAGMA foreign_keys = true;
