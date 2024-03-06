/*
 Navicat Premium Data Transfer

 Source Server         : rust_blog
 Source Server Type    : SQLite
 Source Server Version : 3035005
 Source Schema         : main

 Target Server Type    : SQLite
 Target Server Version : 3035005
 File Encoding         : 65001

 Date: 06/03/2024 10:51:18
*/

PRAGMA foreign_keys = false;

-- ----------------------------
-- Table structure for post
-- ----------------------------
DROP TABLE IF EXISTS "post";
CREATE TABLE "post" (
  "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
  "title" text NOT NULL,
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
