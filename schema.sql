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
                           "salt" TEXT,
                           "nick_name" TEXT NOT NULL,
                           "gender" integer,
                           "avatar_path" TEXT,
                           "signature" TEXT,
                           "created_time" integer NOT NULL,
                           "locked" integer NOT NULL DEFAULT 0
);

-- ----------------------------
-- Table structure for post
-- ----------------------------
DROP TABLE IF EXISTS "post";
CREATE TABLE "post" (
                        "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
                        "title" TEXT NOT NULL,
                        "author" TEXT NOT NULL,
                        "is_view" integer NOT NULL,
                        "original_content" TEXT NOT NULL,
                        "format_content" TEXT NOT NULL,
                        "summary" TEXT,
                        "visits" integer NOT NULL,
                        "disallow_comment" integer NOT NULL,
                        "password" TEXT,
                        "top_priority" integer NOT NULL,
                        "likes" integer NOT NULL,
                        "word_count" integer NOT NULL,
                        "created_time" integer NOT NULL,
                        "update_time" integer NOT NULL
);


PRAGMA foreign_keys = true;
