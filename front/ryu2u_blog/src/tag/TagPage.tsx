/**
 * 标签页
 * 展示某个标签下的文章列表，并复用标签云在标签间互相跳转
 */
import '../category/category.scss'
import {useCallback, useEffect, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {Card, Empty, Typography} from "antd";
import {SideBar} from "../components/SideBar";
import {FloatList} from "../components/FloatList";
import {PostListItem} from "../components/PostListItem/PostListItem";
import {PageInfo, Post, TagCount} from "../common/Structs";
import TagService from "../service/TagService";
import {TagCloud} from "./TagCloud";

const {Title} = Typography;

export function TagPage() {

    const {name} = useParams<{ name: string }>();
    const navigate = useNavigate();
    const [postList, setPostList] = useState<Post[]>([]);
    const [tags, setTags] = useState<TagCount[]>([]);
    const [loading, setLoading] = useState(true);

    // 标签云（所有标签及文章数）
    useEffect(() => {
        TagService.cloud().then((res) => {
            if (res.code === 200) {
                setTags(res.obj as TagCount[] || []);
            }
        });
    }, []);

    // 当前标签下的文章列表
    const getPostsByTag = useCallback(() => {
        if (!name) {
            setPostList([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const pageInfo = new PageInfo();
        pageInfo.page_num = 1;
        pageInfo.page_size = 100;
        pageInfo.total = 0;
        pageInfo.list = [];
        TagService.postsByTag(name, pageInfo).then((res) => {
            setPostList((res.obj as Post[]) || []);
            setLoading(false);
        });
    }, [name]);

    useEffect(() => {
        getPostsByTag();
    }, [getPostsByTag]);

    // 标签之间互相跳转
    const handleTagClick = (clickedTag: string) => {
        navigate(`/tag/${encodeURIComponent(clickedTag)}`);
    };

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
                        <Title level={2} style={{color: 'var(--color-font-default)'}}>
                            {name ? `#${name} 标签` : '标签'}
                        </Title>
                        {name && <p style={{
                            color: 'var(--color-font-default)',
                            opacity: 0.8
                        }}>共有 {postList.length} 篇文章</p>}
                    </Card>

                    {/* 标签云 */}
                    <TagCloud tags={tags} activeName={name} onTagClick={handleTagClick}/>

                    {/* 文章列表 */}
                    {loading ? null : postList.length > 0 ? (
                        postList.map((item, index) => (
                            <PostListItem key={item.id} dir={index % 2 == 0}
                                          postItemJson={JSON.stringify(item)}/>
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
                                description={name ? `#${name} 标签下暂无文章` : '请点击上方标签查看文章'}
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
