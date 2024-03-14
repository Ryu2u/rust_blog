import "./PostListItem.scss"
import {useNavigate} from "react-router";
import {useEffect, useState} from "react";
import {Post} from "../../common/Structs";
import {Divider} from "antd";
import {formatDate} from "../../common/utils";

export function PostListItem({dir, postItemJson}) {
    const navigate = useNavigate();
    const [post, setPost] = useState(new Post());

    useEffect(() => {
        if (postItemJson) {
            let data = JSON.parse(postItemJson);
            data.created_time = new Date(data.created_time);
            data.update_time = new Date(data.update_time);
            setPost(data);
        }
    }, []);

    function postClick() {
        navigate(`/post/${post.id}`);
    }

    return (
        <>
            <div className={dir ? 'post-list-item' : 'post-list-item post-left'}>
                <div className={"post-bg"}>
                    <img alt={"post-alt"} src={"https://api.kdcc.cn"}/>
                </div>
                <div className={"recent-post-info"}>
                    <div className={"recent-post-title"}>
                        <a onClick={() => postClick()} href={""} className={"recent-post-title-a"}>
                            {post.title}
                        </a>
                    </div>
                    <Divider style={{margin: '5px 0'}}>
                        <div className={"recent-post-time"}>
                            发表于{post.created_time ? formatDate(post.created_time as Date) : ''} |
                            更新于{post.update_time ? formatDate(post.update_time as Date) : ''} |
                            类型
                        </div>
                    </Divider>
                    <div className={"recent-post-summary"}>
                        {post.summary}
                    </div>
                </div>

            </div>
        </>
    )
}