import './home.scss'
import {useEffect, useState, useCallback} from "react";
import {useNavigate} from "react-router";
import {SideBar} from "../components/SideBar";
import PostService from "../service/PostService";
import CategoryService from "../service/CategoryService";
import {Category, PageInfo, Post} from "../common/Structs";
import {PostListItem} from "../components/PostListItem/PostListItem";
import {FloatList} from "../components/FloatList";

function createPageInfo(pageNum: number, pageSize: number): PageInfo {
    return {
        page_num: pageNum,
        page_size: pageSize,
        total: 0,
        list: [],
    };
}

export function Home() {
    const navigate = useNavigate();
    const [postList, setPostList] = useState<Post[]>([]);
    const [pageInfo, setPageInfo] = useState<PageInfo>(createPageInfo(1, 10));
    const [categories, setCategories] = useState<Category[]>([]);
    const [loadError, setLoadError] = useState('');

    const getPageList = useCallback((pageNum: number, pageSize: number) => {
        const pageRequest = createPageInfo(pageNum, pageSize);
        PostService.postListPage(pageRequest).then((result) => {
            const nextPageInfo: PageInfo = result.obj;
            setPageInfo(nextPageInfo);
            setPostList(nextPageInfo.list ?? []);
            setLoadError('');
        }).catch(() => {
            setPageInfo(pageRequest);
            setPostList([]);
            setLoadError('文章数据暂时不可用，请确认后端服务已启动。');
        });
    }, []);

    useEffect(() => {
        getPageList(1, 10);
    }, [getPageList]);

    useEffect(() => {
        CategoryService.categoryList().then((result) => {
            setCategories((result.obj as Category[]) ?? []);
        }).catch(() => {
            setCategories([]);
        });
    }, []);

    const featuredPost = postList[0];
    const totalWords = postList.reduce((sum, item) => sum + (item.word_count ?? 0), 0);
    const totalVisits = postList.reduce((sum, item) => sum + (item.visits ?? 0), 0);
    const latestUpdatedDate = featuredPost?.update_time ? new Date(featuredPost.update_time) : null;
    const latestUpdatedYear = latestUpdatedDate ? String(latestUpdatedDate.getFullYear()) : '持续';
    const latestUpdatedDayLabel = latestUpdatedDate
        ? `${latestUpdatedDate.getMonth() + 1}/${latestUpdatedDate.getDate()}`
        : '写作中';

    const viewFeaturedPost = () => {
        if (featuredPost?.id) {
            navigate(`/post/${featuredPost.id}`);
        }
    };

    return (
        <>
            <div className={"container flex home-shell"}>
                <div className={"post-list home-main"}>
                    <section className="home-hero-panel">
                        <div className="home-hero-panel__grid"/>
                        <div className="home-hero-panel__content">
                            <div className="home-hero-panel__copy">
                                <div className="home-eyebrow">
                                    <span className="home-eyebrow__icon">$</span> personal blog
                                </div>
                                <h1>Hai Tao 的代码与生活笔记</h1>
                                <p>
                                    这里记录我关于 Rust、Web、系统设计和日常思考的长期写作。
                                    我更喜欢把复杂问题拆开、写清楚，再慢慢做成可复用的经验。
                                </p>
                                <div className="home-hero-actions">
                                    <button type="button" className="home-primary-btn" onClick={() => navigate('/category')}>
                                        浏览分类
                                    </button>
                                    {featuredPost && (
                                        <button type="button" className="home-secondary-btn" onClick={viewFeaturedPost}>
                                            继续阅读
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="home-hero-panel__stats">
                                <div className="home-stat-card">
                                    <span className="home-stat-card__label">文章</span>
                                    <strong className="home-stat-card__value">{pageInfo.total || postList.length}</strong>
                                </div>
                                <div className="home-stat-card">
                                    <span className="home-stat-card__label">分类</span>
                                    <strong className="home-stat-card__value">{categories.length}</strong>
                                </div>
                                <div className="home-stat-card">
                                    <span className="home-stat-card__label">总字数</span>
                                    <strong className="home-stat-card__value">{totalWords.toLocaleString()}</strong>
                                </div>
                                <div className="home-stat-card">
                                    <span className="home-stat-card__label">最近更新</span>
                                    <strong className="home-stat-card__value home-stat-card__value--compact">
                                        <span>{latestUpdatedYear}</span>
                                        <span className="home-stat-card__subvalue">{latestUpdatedDayLabel}</span>
                                    </strong>
                                </div>
                            </div>
                        </div>
                    </section>

                    {featuredPost && (
                        <section className="home-featured-panel">
                            <div className="home-section-head">
                                <div>
                                    <div className="home-section-head__eyebrow">featured writing</div>
                                    <h2>本期推荐</h2>
                                </div>
                                <span className="home-section-head__meta">
                                    累计访问 {totalVisits.toLocaleString()}
                                </span>
                            </div>
                            <button type="button" className="home-featured-card" onClick={viewFeaturedPost}>
                                <div className="home-featured-card__image">
                                    <img
                                        alt={featuredPost.title}
                                        src={featuredPost.cover_img || "https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com//5.jpg"}
                                    />
                                </div>
                                <div className="home-featured-card__content">
                                    <div className="home-featured-card__tagline">latest dispatch</div>
                                    <h3>{featuredPost.title}</h3>
                                    <p>
                                        {featuredPost.summary && featuredPost.summary.trim() !== ''
                                            ? featuredPost.summary
                                            : '这篇文章目前还没有摘要，可以点进去继续阅读全文。'}
                                    </p>
                                    <div className="home-featured-card__footer">
                                        <span>作者 {featuredPost.author}</span>
                                        <span>字数 {featuredPost.word_count ?? 0}</span>
                                        <span>访问 {featuredPost.visits ?? 0}</span>
                                    </div>
                                </div>
                            </button>
                        </section>
                    )}

                    <section className="home-list-panel">
                        <div className="home-section-head">
                            <div>
                                <div className="home-section-head__eyebrow">latest notes</div>
                                <h2>最新文章</h2>
                            </div>
                            <span className="home-section-head__meta">第 {pageInfo.page_num} 页</span>
                        </div>

                        {loadError && (
                            <div className="home-empty-state">
                                <h3>暂时无法加载文章</h3>
                                <p>{loadError}</p>
                            </div>
                        )}

                        <div className="home-post-stream">
                            {postList.map((item, index) => (
                                <PostListItem key={item.id} dir={index % 2 == 0} postItemJson={JSON.stringify(item)}/>
                            ))}
                        </div>

                        <div className={"pagination-div"}>
                            <ul className="pagination">
                                {(pageInfo.page_num > 1) && (
                                    <li>
                                        <button type="button" onClick={() => getPageList(pageInfo.page_num - 1, pageInfo.page_size)}>«</button>
                                    </li>
                                )}
                                <li>
                                    <button type="button" className={"active"}>{pageInfo.page_num}</button>
                                </li>
                                {(pageInfo.page_num * pageInfo.page_size < pageInfo.total) && (
                                    <>
                                        <li>
                                            <button type="button" onClick={() => getPageList(pageInfo.page_num + 1, pageInfo.page_size)}>
                                                {pageInfo.page_num + 1}
                                            </button>
                                        </li>
                                        <li>
                                            <button type="button" onClick={() => getPageList(pageInfo.page_num + 1, pageInfo.page_size)}>»</button>
                                        </li>
                                    </>
                                )}
                            </ul>
                        </div>
                    </section>
                </div>

                <SideBar
                    catalogJson={""}
                    homeMeta={{
                        postCount: pageInfo.total || postList.length,
                        categoryCount: categories.length,
                        totalWords,
                        totalVisits,
                        featuredTitle: featuredPost?.title
                    }}
                />
            </div>

            <FloatList/>
        </>
    )
}
