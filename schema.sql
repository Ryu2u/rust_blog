-- =====================================================
-- 博客数据库初始化脚本
-- 数据库: MySQL
-- =====================================================

-- ----------------------------
-- 1. PostCategory 表 - 文章与分类的多对多关联表
-- ----------------------------
DROP TABLE IF EXISTS `PostCategory`;
CREATE TABLE `PostCategory` (
    `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    `post_id` INT NOT NULL COMMENT '文章ID',
    `category_id` INT NOT NULL COMMENT '分类ID'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文章分类关联表';

-- ----------------------------
-- 2. PostTag 表 - 文章与标签的多对多关联表
-- ----------------------------
DROP TABLE IF EXISTS `PostTag`;
CREATE TABLE `PostTag` (
    `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    `post_id` INT NOT NULL COMMENT '文章ID',
    `tag_id` INT NOT NULL COMMENT '标签ID'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文章标签关联表';

-- ----------------------------
-- 3. category 表 - 文章分类表
-- ----------------------------
DROP TABLE IF EXISTS `category`;
CREATE TABLE `category` (
    `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    `name` VARCHAR(100) NOT NULL COMMENT '分类名称',
    `slug` VARCHAR(100) NOT NULL COMMENT '分类标识(URL友好)',
    `description` TEXT COMMENT '分类描述',
    `priority` INT DEFAULT 0 COMMENT '优先级(数值越大越靠前)',
    `parent_id` INT DEFAULT NULL COMMENT '父分类ID'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文章分类表';

-- ----------------------------
-- 4. post 表 - 文章表
-- ----------------------------
DROP TABLE IF EXISTS `post`;
CREATE TABLE `post` (
    `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    `title` VARCHAR(255) NOT NULL COMMENT '文章标题',
    `author` VARCHAR(100) NOT NULL COMMENT '作者',
    `is_view` TINYINT NOT NULL DEFAULT 1 COMMENT '是否展示(0:否 1:是)',
    `original_content` TEXT NOT NULL COMMENT '原始Markdown内容',
    `format_content` TEXT NOT NULL COMMENT '转换后的HTML内容',
    `summary` TEXT COMMENT '文章摘要',
    `cover_img` VARCHAR(500) COMMENT '封面图片URL',
    `visits` INT NOT NULL DEFAULT 0 COMMENT '访问量',
    `disallow_comment` TINYINT NOT NULL DEFAULT 1 COMMENT '是否禁止评论(0:否 1:是)',
    `password` VARCHAR(100) COMMENT '访问密码(可选)',
    `top_priority` INT NOT NULL DEFAULT 0 COMMENT '置顶优先级',
    `likes` INT NOT NULL DEFAULT 0 COMMENT '点赞数',
    `word_count` INT NOT NULL DEFAULT 0 COMMENT '字数统计',
    `created_time` BIGINT NOT NULL COMMENT '创建时间戳',
    `update_time` BIGINT NOT NULL COMMENT '更新时间戳',
    `is_deleted` TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除(0:未删除 1:已删除)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文章表';

-- ----------------------------
-- 5. tag 表 - 文章标签表
-- ----------------------------
DROP TABLE IF EXISTS `tag`;
CREATE TABLE `tag` (
    `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    `name` VARCHAR(100) NOT NULL COMMENT '标签名称',
    `slug` VARCHAR(100) NOT NULL COMMENT '标签标识(URL友好)',
    `description` TEXT COMMENT '标签描述',
    `priority` INT DEFAULT 0 COMMENT '优先级(数值越大越靠前)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文章标签表';

-- ----------------------------
-- 6. comment 表 - 文章评论表
-- ----------------------------
DROP TABLE IF EXISTS `comment`;
CREATE TABLE `comment` (
    `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    `post_id` INT NOT NULL COMMENT '文章ID',
    `user_email` VARCHAR(255) NOT NULL COMMENT '评论者邮箱',
    `user_name` VARCHAR(100) NOT NULL COMMENT '评论者昵称',
    `content` TEXT NOT NULL COMMENT '评论内容',
    `created_time` BIGINT NOT NULL COMMENT '评论时间戳',
    `parent_id` INT DEFAULT NULL COMMENT '父评论ID，NULL表示顶级评论',
    `status` TINYINT NOT NULL DEFAULT 0 COMMENT '审核状态(0:待审核 1:已通过 2:已拒绝)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='文章评论表';

-- ----------------------------
-- 7. moment 表 - 说说/动态表
-- ----------------------------
DROP TABLE IF EXISTS `moment`;
CREATE TABLE `moment` (
    `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    `content` TEXT NOT NULL COMMENT '说说内容',
    `images` TEXT COMMENT '图片JSON数组',
    `is_public` TINYINT NOT NULL DEFAULT 1 COMMENT '是否公开(0:私密 1:公开)',
    `location` VARCHAR(255) COMMENT '位置',
    `likes` INT NOT NULL DEFAULT 0 COMMENT '点赞数',
    `comments` INT NOT NULL DEFAULT 0 COMMENT '评论数',
    `created_time` BIGINT NOT NULL COMMENT '创建时间戳',
    `update_time` BIGINT COMMENT '更新时间戳',
    `is_deleted` TINYINT NOT NULL DEFAULT 0 COMMENT '逻辑删除(0:未删除 1:已删除)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='说说动态表';

-- ----------------------------
-- 8. tb_user 表 - 用户表
-- ----------------------------
DROP TABLE IF EXISTS `tb_user`;
CREATE TABLE `tb_user` (
    `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    `username` VARCHAR(100) NOT NULL COMMENT '用户名',
    `password` VARCHAR(255) NOT NULL COMMENT '密码',
    `salt` VARCHAR(50) COMMENT '盐值',
    `nick_name` VARCHAR(100) NOT NULL COMMENT '昵称',
    `gender` TINYINT COMMENT '性别(0:未知 1:男 2:女)',
    `avatar_path` VARCHAR(500) COMMENT '头像路径',
    `signature` TEXT COMMENT '个性签名',
    `created_time` BIGINT NOT NULL COMMENT '创建时间戳',
    `locked` TINYINT NOT NULL DEFAULT 0 COMMENT '是否锁定(0:否 1:是)',
    `role` VARCHAR(20) NOT NULL DEFAULT 'user' COMMENT '角色(admin:管理员 user:普通用户)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表';
