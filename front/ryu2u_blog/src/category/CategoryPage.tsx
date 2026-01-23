import './category.scss'
import {useEffect, useState, useCallback} from "react";
import {SideBar} from "../components/SideBar";
import {Category, PageInfo, Post} from "../common/Structs";
import {PostListItem} from "../components/PostListItem/PostListItem";
import {FloatList} from "../components/FloatList";
import {useParams, useNavigate} from "react-router-dom";
import {Tag, Card, Empty, Typography, Space} from "antd";
import {TagOutlined} from "@ant-design/icons";
import CategoryService from "../service/CategoryService.ts";
import PostService from "../service/PostService.ts";

const {Title} = Typography;

export function CategoryPage() {

    const {tag} = useParams<{tag: string}>();
    const navigate = useNavigate();
    const [postList, setPostList] = useState<Post[]>([]);
    const [tags, setTags] = useState<string[]>([]);

    useEffect(() => {
        // get all tags
        CategoryService.categoryList().then((res) => {
            const data = res.obj as Category[];
            setTags(data.map(v => v.name));
        });
    }, []);

    // 获取所有文章和标签
    const getAllPostsAndTags = useCallback(() => {
        if (tag) {
            const pageInfo = new PageInfo();
            pageInfo.page_num = 1;
            pageInfo.page_size = 100;
            pageInfo.total = 0;
            pageInfo.list = [];
            // 使用模拟数据
            PostService.postListByCategory(tag, pageInfo).then((res) => {
                setPostList(res.obj)
            })
        }


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
                        <Title level={2}
                               style={{color: 'var(--color-font-default)'}}>{tag ? `${tag} 分类` : '所有分类'}</Title>
                        {tag && <p style={{
                            color: 'var(--color-font-default)',
                            opacity: 0.8
                        }}>共有 {postList.length} 篇文章</p>}
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
                        <Title level={3} style={{color: 'var(--color-font-default)'}}><TagOutlined
                            style={{color: 'var(--color-primary)'}}/> 所有标签</Title>
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
                                    style={{color: 'var(--color-font-default)'}}
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
                                style={{color: 'var(--color-font-default)'}}
                            />
                        </Card>
                    )}

                </div>

                <SideBar catalogJson={""}/>
            </div>

            <FloatList/>

        </>
    )
}
