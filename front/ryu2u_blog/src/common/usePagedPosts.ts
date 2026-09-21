import {useCallback, useEffect, useRef, useState} from "react";
import {Post, Result} from "./Structs";

/** 公开文章列表每页条数（「加载更多」粒度） */
export const POST_PAGE_SIZE = 20;

/** 拉取一页文章列表：obj 为 Post[] */
export type PostPageFetcher = (pageNum: number, pageSize: number) => Promise<Result>;

/**
 * 「加载更多」式分页列表
 * - resetKey（分类名 / 标签名）变化时自动回到第 1 页并清空旧数据；
 * - fetcher 通过 ref 调用，调用方无需 useCallback 包裹也不会漏请求；
 * - hasMore 由「本页是否返回满一页」推断，故已加载条数不会冒充总数。
 */
export function usePagedPosts(
    fetcher: PostPageFetcher,
    resetKey: string | undefined,
    pageSize: number = POST_PAGE_SIZE
) {
    const [list, setList] = useState<Post[]>([]);
    const [pageNum, setPageNum] = useState(1);
    // 有 key 表示即将发起首页请求，初始即视为 loading，避免首帧闪出空状态
    const [loading, setLoading] = useState(resetKey !== undefined);
    const [hasMore, setHasMore] = useState(false);

    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    // resetKey 变化 → 重置到第一页
    useEffect(() => {
        if (!resetKey) {
            setList([]);
            setPageNum(1);
            setHasMore(false);
            setLoading(false);
            return;
        }
        let cancelled = false;
        setList([]);
        setPageNum(1);
        setHasMore(false);
        setLoading(true);
        fetcherRef.current(1, pageSize).then((res) => {
            if (cancelled) return;
            const data = (res?.obj as Post[]) || [];
            setList(data);
            setHasMore(data.length === pageSize);
            setLoading(false);
        }).catch(() => {
            if (cancelled) return;
            setList([]);
            setHasMore(false);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [resetKey, pageSize]);

    // 追加下一页
    const loadMore = useCallback(() => {
        if (loading || !hasMore || !resetKey) return;
        const next = pageNum + 1;
        setLoading(true);
        fetcherRef.current(next, pageSize).then((res) => {
            const data = (res?.obj as Post[]) || [];
            setList((prev) => prev.concat(data));
            setPageNum(next);
            setHasMore(data.length === pageSize);
            setLoading(false);
        }).catch(() => {
            setLoading(false);
        });
    }, [loading, hasMore, pageNum, pageSize, resetKey]);

    return {list, loading, hasMore, loadMore, loaded: list.length};
}
