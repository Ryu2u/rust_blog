import './category.scss'
import {useEffect, useState, useCallback} from "react";
import {SideBar} from "../components/SideBar";
import {PageInfo, Post, TagCount} from "../common/Structs";
import {PostListItem} from "../components/PostListItem/PostListItem";
import {FloatList} from "../components/FloatList";
import {useParams, useNavigate} from "react-router-dom";
import {Card, Empty, Typography} from "antd";
import PostService from "../service/PostService.ts";
import TagService from "../service/TagService.ts";
import {TagCloud} from "../tag/TagCloud.tsx";

const {Title} = Typography;

export function CategoryPage() {

    const {tag} = useParams<{tag: string}>();
    const navigate = useNavigate();
    const [postList, setPostList] = useState<Post[]>([]);
    const [tags, setTags] = useState<TagCount[]>([]);

    useEffect(() => {
        // get all tags（标签云：已被文章引用的标签 + 文章数，后端按文章数倒序）
        TagService.cloud().then((res) => {
            if (res.code === 200) {
                setTags(res.obj as TagCount[] || []);
            }
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

    // 处理标签点击：跳转到标签页
    const handleTagClick = (clickedTag: string) => {
        navigate(`/tag/${encodeURIComponent(clickedTag)}`);
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
                    <TagCloud tags={tags} onTagClick={handleTagClick}/>

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
                                description="请点击上方标签查看对应文章"
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
