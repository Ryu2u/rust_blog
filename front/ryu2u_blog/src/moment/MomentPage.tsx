/**
 * 说说页
 * 公开说说时间线（只展示公开且未删除的），分页「加载更多」
 */
import '../category/category.scss'
import './moment.scss'
import {useEffect, useState} from "react";
import {Empty, Image} from "antd";
import {EnvironmentOutlined} from "@ant-design/icons";
import {SideBar} from "../components/SideBar";
import {FloatList} from "../components/FloatList";
import {Moment, PageInfo} from "../common/Structs";
import MomentService from "../service/MomentService";
import {formatDate} from "../common/utils";

/** 每页条数（「加载更多」粒度） */
const MOMENT_PAGE_SIZE = 10;

/** 按图片张数选网格列数：1 张单图，2 / 4 张两列，其余三列 */
function imageLayout(count: number): string {
    if (count === 1) return 'single';
    if (count === 2 || count === 4) return 'two';
    return 'three';
}

export function MomentPage() {
    const [list, setList] = useState<Moment[]>([]);
    const [total, setTotal] = useState(0);
    const [pageNum, setPageNum] = useState(1);
    const [loading, setLoading] = useState(true);
    // 首屏加载失败 / 加载更多失败分开提示：后者不应清空已加载内容
    const [loadError, setLoadError] = useState(false);
    const [moreError, setMoreError] = useState(false);
    // 翻页拿到空页（期间有说说被删）时停止继续请求，避免「加载更多」死循环
    const [exhausted, setExhausted] = useState(false);

    // 首屏：第 1 页
    useEffect(() => {
        let cancelled = false;
        MomentService.page(1, MOMENT_PAGE_SIZE).then((res) => {
            if (cancelled) return;
            const page = res?.obj as PageInfo | undefined;
            setList((page?.list as Moment[]) ?? []);
            setTotal(page?.total ?? 0);
            setLoading(false);
        }).catch(() => {
            if (cancelled) return;
            setLoadError(true);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const hasMore = !exhausted && list.length < total;

    const loadMore = () => {
        if (loading || !hasMore) return;
        const next = pageNum + 1;
        setLoading(true);
        setMoreError(false);
        MomentService.page(next, MOMENT_PAGE_SIZE).then((res) => {
            const page = res?.obj as PageInfo | undefined;
            const items = (page?.list as Moment[]) ?? [];
            // 翻页期间有新说说发布会让后面的页整体后移，按 id 去重避免重复条目
            setList((prev) => {
                const seen = new Set(prev.map((m) => m.id));
                return prev.concat(items.filter((m) => !seen.has(m.id)));
            });
            setTotal(page?.total ?? 0);
            setPageNum(next);
            setExhausted(items.length === 0);
        }).catch(() => {
            setMoreError(true);
        }).finally(() => {
            setLoading(false);
        });
    };

    return (
        <>
            <div className={"container"}>
                <div className={"post-list"}>
                    <header className="page-header">
                        <div className="page-header__eyebrow">动态</div>
                        <h1 className="page-header__title">说说</h1>
                        <p className="page-header__meta">
                            {total > 0 ? `共 ${total} 条` : '随手记下的想法和片段'}
                        </p>
                    </header>

                    {loadError && (
                        <div className="home-empty-state">
                            <h3>暂时无法加载说说</h3>
                            <p>请确认后端服务已启动，稍后刷新重试。</p>
                        </div>
                    )}

                    {list.length === 0 ? (
                        (loading || loadError) ? null : (
                            <div className="empty-state">
                                <Empty description="还没有公开的说说" image={Empty.PRESENTED_IMAGE_SIMPLE}/>
                            </div>
                        )
                    ) : (
                        <>
                            <ol className="moment-timeline">
                                {list.map((item) => (
                                    <li key={item.id} className="moment-item">
                                        <span className="moment-item__dot"/>
                                        <article className="moment-card">
                                            <time className="moment-card__time">
                                                {formatDate(new Date(item.created_time), 'yyyy-MM-dd HH:mm')}
                                            </time>
                                            <p className="moment-card__content">{item.content}</p>
                                            {item.images.length > 0 && (
                                                <Image.PreviewGroup>
                                                    <div className={`moment-images moment-images--${imageLayout(item.images.length)}`}>
                                                        {item.images.map((src, idx) => (
                                                            <Image key={`${src}-${idx}`} src={src} loading="lazy"/>
                                                        ))}
                                                    </div>
                                                </Image.PreviewGroup>
                                            )}
                                            {item.location && (
                                                <div className="moment-card__location">
                                                    <EnvironmentOutlined/> {item.location}
                                                </div>
                                            )}
                                        </article>
                                    </li>
                                ))}
                            </ol>
                            {hasMore && (
                                <div className="load-more">
                                    <button
                                        type="button"
                                        className="load-more-btn"
                                        onClick={loadMore}
                                        disabled={loading}
                                    >
                                        {loading ? '加载中…' : moreError ? '加载失败，点击重试' : `加载更多（已加载 ${list.length} / ${total} 条）`}
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
