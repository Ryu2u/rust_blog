/**
 * 标签页
 * 展示某个标签下的文章列表（分页加载更多），并复用标签云在标签间互相跳转
 */
import '../category/category.scss'
import {useEffect, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {Card, Empty, Typography} from "antd";
import {SideBar} from "../components/SideBar";
import {FloatList} from "../components/FloatList";
import {PostListItem} from "../components/PostListItem/PostListItem";
import {PageInfo, TagCount} from "../common/Structs";
import TagService from "../service/TagService";
import {ChipCloud, DEFAULT_VISIBLE_CHIP_COUNT} from "../components/ChipCloud/ChipCloud";
import {usePagedPosts} from "../common/usePagedPosts";

const {Title} = Typography;

export function TagPage() {

    const {name} = useParams<{ name: string }>();
    const navigate = useNavigate();
    const [tags, setTags] = useState<TagCount[]>([]);

    // 当前标签下的文章列表（分页：返回满一页时给出「加载更多」；切换标签自动回到第一页）
    const {list: postList, loading, hasMore, loadMore} = usePagedPosts((pageNum, pageSize) => {
        const pageInfo = new PageInfo();
        pageInfo.page_num = pageNum;
        pageInfo.page_size = pageSize;
        pageInfo.total = 0;
        pageInfo.list = [];
        return name
            ? TagService.postsByTag(name, pageInfo)
            : Promise.resolve({code: 200, msg: '', obj: []});
    }, name);

    // 标签云（所有标签及公开文章数）
    useEffect(() => {
        TagService.cloud().then((res) => {
            if (res.code === 200) {
                setTags(res.obj as TagCount[] || []);
            }
        });
    }, []);

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
                        }}>{hasMore ? `已加载 ${postList.length} 篇` : `共 ${postList.length} 篇文章`}</p>}
                    </Card>

                    {/* 标签云 */}
                    <ChipCloud
                        title="所有标签"
                        items={tags}
                        activeName={name}
                        visibleCount={DEFAULT_VISIBLE_CHIP_COUNT}
                        onChipClick={handleTagClick}
                    />

                    {/* 文章列表 */}
                    {postList.length === 0 ? (
                        loading ? null : (
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
                        )
                    ) : (
                        <>
                            {postList.map((item, index) => (
                                <PostListItem key={item.id} dir={index % 2 == 0}
                                              postItemJson={JSON.stringify(item)}/>
                            ))}
                            {hasMore && (
                                <div className="load-more">
                                    <button
                                        type="button"
                                        className="load-more-btn"
                                        onClick={loadMore}
                                        disabled={loading}
                                    >
                                        {loading ? '加载中…' : `加载更多（已加载 ${postList.length} 篇）`}
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                </div>

                <SideBar catalogJson={""}/>
            </div>

            <FloatList/>

        </>
    )
}
