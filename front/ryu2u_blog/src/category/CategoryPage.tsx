import './category.scss'
import {useEffect, useState} from "react";
import {SideBar} from "../components/SideBar";
import {Category, PageInfo, TagCount} from "../common/Structs";
import {PostListItem} from "../components/PostListItem/PostListItem";
import {FloatList} from "../components/FloatList";
import {useParams, useNavigate} from "react-router-dom";
import {Card, Empty, Typography} from "antd";
import {FolderOutlined} from "@ant-design/icons";
import CategoryService from "../service/CategoryService.ts";
import PostService from "../service/PostService.ts";
import TagService from "../service/TagService.ts";
import {ChipCloud, DEFAULT_VISIBLE_CHIP_COUNT} from "../components/ChipCloud/ChipCloud.tsx";
import {usePagedPosts} from "../common/usePagedPosts.ts";

const {Title} = Typography;

export function CategoryPage() {

    const {tag} = useParams<{tag: string}>();
    const navigate = useNavigate();
    const [categories, setCategories] = useState<Category[]>([]);
    const [tags, setTags] = useState<TagCount[]>([]);

    // 分类文章列表（分页：返回满一页时给出「加载更多」；切换分类自动回到第一页）
    const {list: postList, loading, hasMore, loadMore} = usePagedPosts((pageNum, pageSize) => {
        const pageInfo = new PageInfo();
        pageInfo.page_num = pageNum;
        pageInfo.page_size = pageSize;
        pageInfo.total = 0;
        pageInfo.list = [];
        return tag
            ? PostService.postListByCategory(tag, pageInfo)
            : Promise.resolve({code: 200, msg: '', obj: []});
    }, tag);

    // 所有分类
    useEffect(() => {
        CategoryService.categoryList().then((res) => {
            if (res.code === 200) {
                setCategories((res.obj as Category[]) || []);
            }
        });
    }, []);

    // 所有标签（标签云：已被公开文章引用的标签 + 文章数，后端按文章数倒序）
    useEffect(() => {
        TagService.cloud().then((res) => {
            if (res.code === 200) {
                setTags(res.obj as TagCount[] || []);
            }
        });
    }, []);

    // 处理分类点击：跳转到分类页
    const handleCategoryClick = (clickedCategory: string) => {
        navigate(`/category/${encodeURIComponent(clickedCategory)}`);
    };

    // 处理标签点击：跳转到标签页
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
                        <Title level={2}
                               style={{color: 'var(--color-font-default)'}}>{tag ? `${tag} 分类` : '所有分类'}</Title>
                        {tag && <p style={{
                            color: 'var(--color-font-default)',
                            opacity: 0.8
                        }}>{hasMore ? `已加载 ${postList.length} 篇` : `共 ${postList.length} 篇文章`}</p>}
                    </Card>

                    {/* 所有分类：点击进入分类页（沿用既有分类筛选逻辑） */}
                    <ChipCloud
                        title="所有分类"
                        icon={<FolderOutlined style={{color: 'var(--color-primary)'}}/>}
                        items={categories}
                        activeName={tag}
                        onChipClick={handleCategoryClick}
                    />

                    {/* 标签云 */}
                    <ChipCloud
                        title="所有标签"
                        items={tags}
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
                                    description={tag ? '该分类下暂无文章' : '请点击上方分类或标签查看文章'}
                                    style={{color: 'var(--color-font-default)'}}
                                />
                            </Card>
                        )
                    ) : (
                        <>
                            {postList.map((item, index) => (
                                <PostListItem key={item.id} dir={index % 2 == 0} postItemJson={JSON.stringify(item)}/>
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
