

import "./PostListItem.scss"

export function PostListItem({dir}) {
    return (
        <>
            <div className={dir? 'post-list-item':'post-list-item post-left'}>
                <div className={"post-bg"}>
                    <img  src={"https://media.istockphoto.com/id/1496108471/zh/%E7%85%A7%E7%89%87/the-matterhorn-mountain-peaks-are-reflected-in-the-lake.jpg?s=2048x2048&w=is&k=20&c=hL-M_yAA0fNiuSr5bd90yc0cKUwl7bBYlgw6MYemRGc="}/>
                </div>
                <div className={"recent-post-info"}>
                    <div className={"recent-post-title"}>
                        recent-post-title
                    </div>
                    <div className={"recent-post-time"}>
                        发表于2022-07-29|更新于2022-07-29|Java
                    </div>
                    <div className={"recent-post-summary"}>
                        recent-post-ssummarysummarysummarysummaryummary
                        recent-post-ssummarysummarysummarysummaryummary
                        recent-post-ssummarysummarysummarysummaryummary
                        recent-post-ssummarysummarysummarysummaryummary
                        recent-post-ssummarysummarysummarysummaryummary
                        recent-post-ssummarysummarysummarysummaryummary
                    </div>
                </div>

            </div>
        </>
    )
}