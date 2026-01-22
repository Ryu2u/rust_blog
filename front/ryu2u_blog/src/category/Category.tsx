import './category.scss'
import {useEffect, useState, useCallback} from "react";
import {Header} from "../components/Header";
import {Footer} from "../components/Footer";
import {SideBar} from "../components/SideBar";
import PostService from "../service/PostService";
import {PageInfo, Post} from "../common/Structs";
import {PostListItem} from "../components/PostListItem/PostListItem";
import {FloatList} from "../components/FloatList";
import {useParams, useNavigate} from "react-router-dom";
import {Tag, Card, Empty, Typography, Space} from "antd";
import {TagOutlined} from "@ant-design/icons";

const {Title} = Typography;

export function Category() {

    const {tag} = useParams<{tag: string}>();
    const navigate = useNavigate();
    const [postList, setPostList] = useState<Post[]>([]);
    const [allPosts, setAllPosts] = useState<Post[]>([]);
    const [tags, setTags] = useState<string[]>([]);

    // 模拟数据
    const mockPosts: Post[] = [
        {
            id: 1,
            title: "React入门教程",
            author: "admin",
            is_view: 1,
            original_content: "# React入门教程",
            format_content: "<h1>React入门教程</h1>",
            summary: "React是一个用于构建用户界面的JavaScript库",
            cover_img: "",
            visits: 100,
            disallow_comment: 0,
            top_priority: 0,
            likes: 10,
            word_count: 1000,
            created_time: new Date(),
            update_time: new Date(),
            category: "前端",
            tag: "React"
        },
        {
            id: 2,
            title: "TypeScript高级特性",
            author: "admin",
            is_view: 1,
            original_content: "# TypeScript高级特性",
            format_content: "<h1>TypeScript高级特性</h1>",
            summary: "深入了解TypeScript的高级特性",
            cover_img: "",
            visits: 80,
            disallow_comment: 0,
            top_priority: 0,
            likes: 8,
            word_count: 1200,
            created_time: new Date(),
            update_time: new Date(),
            category: "前端",
            tag: "TypeScript"
        },
        {
            id: 3,
            title: "CSS Grid布局详解",
            author: "admin",
            is_view: 1,
            original_content: "# CSS Grid布局详解",
            format_content: "<h1>CSS Grid布局详解</h1>",
            summary: "掌握CSS Grid布局的核心概念",
            cover_img: "",
            visits: 60,
            disallow_comment: 0,
            top_priority: 0,
            likes: 6,
            word_count: 900,
            created_time: new Date(),
            update_time: new Date(),
            category: "前端",
            tag: "CSS"
        },
        {
            id: 4,
            title: "Node.js实战",
            author: "admin",
            is_view: 1,
            original_content: "# Node.js实战",
            format_content: "<h1>Node.js实战</h1>",
            summary: "使用Node.js构建后端服务",
            cover_img: "",
            visits: 120,
            disallow_comment: 0,
            top_priority: 0,
            likes: 12,
            word_count: 1500,
            created_time: new Date(),
            update_time: new Date(),
            category: "后端",
            tag: "Node.js"
        },
        {
            id: 5,
            title: "Docker容器化部署",
            author: "admin",
            is_view: 1,
            original_content: "# Docker容器化部署",
            format_content: "<h1>Docker容器化部署</h1>",
            summary: "学习Docker容器化技术",
            cover_img: "",
            visits: 90,
            disallow_comment: 0,
            top_priority: 0,
            likes: 9,
            word_count: 1100,
            created_time: new Date(),
            update_time: new Date(),
            category: "后端",
            tag: "Docker"
        }
    ];

    // 获取所有文章和标签
    const getAllPostsAndTags = useCallback(() => {
        const pageInfo = new PageInfo();
        pageInfo.page_num = 1;
        pageInfo.page_size = 100;
        pageInfo.total = 0;
        pageInfo.list = [];
        
        // 使用模拟数据
        setAllPosts(mockPosts);
        
        // 提取所有唯一标签
        const uniqueTags = new Set<string>();
        mockPosts.forEach((post: Post) => {
            if (post.tag) {
                uniqueTags.add(post.tag);
            }
        });
        setTags(Array.from(uniqueTags));
        
        // 过滤当前标签的文章
        if (tag) {
            const filtered = mockPosts.filter((post: Post) => 
                post.tag === tag
            );
            setPostList(filtered);
        } else {
            setPostList([]);
        }
        
        // 实际API调用（注释掉，使用模拟数据）
        /*
        PostService.postListPage(pageInfo).then((result) => {
            const pageInfo: PageInfo = result.obj;
            setAllPosts(pageInfo.list);
            
            // 提取所有唯一标签
            const uniqueTags = new Set<string>();
            pageInfo.list.forEach((post: Post) => {
                if (post.tag) {
                    uniqueTags.add(post.tag);
                }
            });
            setTags(Array.from(uniqueTags));
            
            // 过滤当前标签的文章
            if (tag) {
                const filtered = pageInfo.list.filter((post: Post) => 
                    post.tag === tag
                );
                setPostList(filtered);
            } else {
                setPostList([]);
            }
        });
        */
    }, [tag]);

    // 处理标签点击
    const handleTagClick = (clickedTag: string) => {
        navigate(`/category/${clickedTag}`);
    };

    useEffect(() => {
        getAllPostsAndTags();
    }, [getAllPostsAndTags]);

    return (
        <>
            <Header/>
            <div className={"container flex"}>
                <div className={"post-list"}>
                    {/* 页面标题 */}
                    <Card 
                        className="category-header" 
                        bordered={false}
                        style={{ 
                            backgroundColor: 'var(--color-post-content-bg-default)',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                        }}
                    >
                        <Title level={2} style={{ color: 'var(--color-font-default)' }}>{tag ? `${tag} 分类` : '所有分类'}</Title>
                        {tag && <p style={{ color: 'var(--color-font-default)', opacity: 0.8 }}>共有 {postList.length} 篇文章</p>}
                    </Card>
                    
                    {/* 标签云 */}
                    <Card 
                        className="tag-cloud" 
                        bordered={false}
                        style={{ 
                            backgroundColor: 'var(--color-post-content-bg-default)',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                        }}
                    >
                        <Title level={3} style={{ color: 'var(--color-font-default)' }}><TagOutlined style={{ color: 'var(--color-primary)' }} /> 所有标签</Title>
                        <Space size={[12, 12]} wrap>
                            {tags.map((tagItem) => (
                                <Tag 
                                    key={tagItem}
                                    onClick={() => handleTagClick(tagItem)}
                                    style={{ 
                                        cursor: 'pointer', 
                                        fontSize: '14px',
                                        padding: '4px 12px',
                                        borderRadius: '16px',
                                        backgroundColor: tag === tagItem ? 'var(--color-primary)' : 'transparent',
                                        color: tag === tagItem ? '#fff' : 'var(--color-font-default)',
                                        border: `1px solid ${tag === tagItem ? 'var(--color-primary)' : 'var(--color-font-default)'}`,
                                        opacity: tag === tagItem ? 1 : 0.8,
                                        transition: 'all 0.3s ease'
                                    }}
                                >
                                    {tagItem}
                                </Tag>
                            ))}
                        </Space>
                    </Card>
                    
                    {/* 文章列表 */}
                    {tag ? (
                        postList.length > 0 ? (
                            postList.map((item, index) => (
                                <PostListItem key={item.id} dir={index % 2 == 0} postItemJson={JSON.stringify(item)}/>
                            ))
                        ) : (
                            <Card 
                                className="empty-state" 
                                bordered={false}
                                style={{ 
                                    backgroundColor: 'var(--color-post-content-bg-default)',
                                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                                }}
                            >
                                <Empty 
                                    description="该标签下暂无文章" 
                                    style={{ color: 'var(--color-font-default)' }}
                                />
                            </Card>
                        )
                    ) : (
                        <Card 
                            className="empty-state" 
                            bordered={false}
                            style={{ 
                                backgroundColor: 'var(--color-post-content-bg-default)',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                            }}
                        >
                            <Empty 
                                description="请点击上方标签查看对应分类的文章" 
                                style={{ color: 'var(--color-font-default)' }}
                            />
                        </Card>
                    )}

                </div>

                <SideBar catalogJson={""}/>
            </div>

            <Footer/>

            <FloatList/>

        </>
    )
}
