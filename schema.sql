/*
 Navicat Premium Data Transfer

 Source Server         : rust_blog
 Source Server Type    : SQLite
 Source Server Version : 3035005
 Source Schema         : main

 Target Server Type    : SQLite
 Target Server Version : 3035005
 File Encoding         : 65001

 Date: 18/03/2024 17:57:02
*/

PRAGMA foreign_keys = false;

-- ----------------------------
-- Table structure for PostCategory
-- ----------------------------
DROP TABLE IF EXISTS "PostCategory";
CREATE TABLE "PostCategory" (
                                "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                                "post_id" INTEGER NOT NULL,
                                "category_id" INTEGER NOT NULL
);

-- ----------------------------
-- Table structure for PostTag
-- ----------------------------
DROP TABLE IF EXISTS "PostTag";
CREATE TABLE "PostTag" (
                           "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                           "post_id" INTEGER NOT NULL,
                           "tag_id" INTEGER NOT NULL
);

-- ----------------------------
-- Table structure for category
-- ----------------------------
DROP TABLE IF EXISTS "category";
CREATE TABLE "category" (
                            "id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
                            "name" TEXT NOT NULL,
                            "slug" text NOT NULL,
                            "description" TEXT,
                            "priority" integer DEFAULT 0,
                            "parent_id" INTEGER
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
                        "cover_img" TEXT,
                        "visits" integer NOT NULL,
                        "disallow_comment" integer NOT NULL,
                        "password" TEXT,
                        "top_priority" integer NOT NULL,
                        "likes" integer NOT NULL,
                        "word_count" integer NOT NULL,
                        "created_time" integer NOT NULL,
                        "update_time" integer NOT NULL,
                        "is_deleted" integer NOT NULL
);

-- ----------------------------
-- Table structure for tag
-- ----------------------------
DROP TABLE IF EXISTS "tag";
CREATE TABLE "tag" (
                       "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                       "name" TEXT NOT NULL,
                       "slug" text NOT NULL,
                       "description" TEXT,
                       "priority" integer DEFAULT 0
);

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

PRAGMA foreign_keys = true;
