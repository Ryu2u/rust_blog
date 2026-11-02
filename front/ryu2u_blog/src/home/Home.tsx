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

/// 窗口式页码：恒显第 1 页与最后一页，当前页左右各 2 个，间隙折叠为省略号
function buildPageNumbers(pageNum: number, pageSize: number, total: number): (number | '...')[] {
    const totalPages = Math.max(1, Math.ceil((total || 0) / Math.max(1, pageSize)));
    const pages: (number | '...')[] = [];
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || Math.abs(i - pageNum) <= 2) {
            pages.push(i);
        } else if (pages[pages.length - 1] !== '...') {
            pages.push('...');
        }
    }
    return pages;
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
    const latestUpdatedLabel = latestUpdatedDate
        ? `${latestUpdatedDate.getMonth() + 1} 月 ${latestUpdatedDate.getDate()} 日`
        : '写作中';

    const viewFeaturedPost = () => {
        if (featuredPost?.id) {
            navigate(`/post/${featuredPost.id}`);
        }
    };

    return (
        <>
            <div className={"container home-shell"}>
                <div className={"post-list home-main"}>
                    <section className="home-hero">
                        <div className="home-hero__eyebrow">个人博客</div>
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
                        <dl className="home-stats">
                            <div className="home-stat">
                                <dt>文章</dt>
                                <dd>{pageInfo.total || postList.length}</dd>
                            </div>
                            <div className="home-stat">
                                <dt>分类</dt>
                                <dd>{categories.length}</dd>
                            </div>
                            <div className="home-stat">
                                <dt>总字数</dt>
                                <dd>{totalWords.toLocaleString()}</dd>
                            </div>
                            <div className="home-stat">
                                <dt>最近更新</dt>
                                <dd>{latestUpdatedLabel}</dd>
                            </div>
                        </dl>
                    </section>

                    {featuredPost && (
                        <section>
                            <div className="home-section-head">
                                <h2>本期推荐</h2>
                                <span className="home-section-head__meta">
                                    累计访问 {totalVisits.toLocaleString()}
                                </span>
                            </div>
                            <button type="button" className="home-featured-card" onClick={viewFeaturedPost}>
                                <span className="home-featured-card__label">最新文章</span>
                                <h3>{featuredPost.title}</h3>
                                <p>
                                    {featuredPost.summary && featuredPost.summary.trim() !== ''
                                        ? featuredPost.summary
                                        : '这篇文章目前还没有摘要，可以点进去继续阅读全文。'}
                                </p>
                                <div className="home-featured-card__footer">
                                    <span>{featuredPost.author}</span>
                                    <span>{(featuredPost.word_count ?? 0).toLocaleString()} 字</span>
                                    <span>{(featuredPost.visits ?? 0).toLocaleString()} 次阅读</span>
                                    <span className="home-featured-card__more">阅读全文 →</span>
                                </div>
                            </button>
                        </section>
                    )}

                    <section>
                        <div className="home-section-head">
                            <h2>最新文章</h2>
                            <span className="home-section-head__meta">第 {pageInfo.page_num} 页</span>
                        </div>

                        {loadError && (
                            <div className="home-empty-state">
                                <h3>暂时无法加载文章</h3>
                                <p>{loadError}</p>
                            </div>
                        )}

                        {postList.length > 0 && (
                            <div className="post-stream">
                                {postList.map((item) => (
                                    <PostListItem key={item.id} postItemJson={JSON.stringify(item)}/>
                                ))}
                            </div>
                        )}

                        <div className={"pagination-div"}>
                            <ul className="pagination">
                                {(pageInfo.page_num > 1) && (
                                    <li>
                                        <button type="button" aria-label="上一页" onClick={() => getPageList(pageInfo.page_num - 1, pageInfo.page_size)}>‹</button>
                                    </li>
                                )}
                                {buildPageNumbers(pageInfo.page_num, pageInfo.page_size, pageInfo.total).map((item, idx) =>
                                    item === '...'
                                        ? <li key={`ellipsis-${idx}`} className="pagination-ellipsis">…</li>
                                        : (
                                            <li key={item}>
                                                <button
                                                    type="button"
                                                    className={item === pageInfo.page_num ? 'active' : ''}
                                                    onClick={() => getPageList(item, pageInfo.page_size)}
                                                >
                                                    {item}
                                                </button>
                                            </li>
                                        )
                                )}
                                {(pageInfo.page_num * pageInfo.page_size < pageInfo.total) && (
                                    <li>
                                        <button type="button" aria-label="下一页" onClick={() => getPageList(pageInfo.page_num + 1, pageInfo.page_size)}>›</button>
                                    </li>
                                )}
                            </ul>
                            {(pageInfo.total > 0) && (
                                <div className="pagination-total">
                                    共 {Math.ceil(pageInfo.total / pageInfo.page_size)} 页 · {pageInfo.total} 篇
                                </div>
                            )}
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
