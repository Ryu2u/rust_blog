import "./PostListItem.scss"
import {useNavigate} from "react-router";
import {useEffect, useState} from "react";
import {Post} from "../../common/Structs";

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
                    <img alt={"post-alt"} src={"https://source.unsplash.com/random"}/>
                </div>
                <div className={"recent-post-info"}>
                    <div className={"recent-post-title"}>
                        <a onClick={() => postClick()} href={""} className={"recent-post-title-a"}>
                            {post.title}
                        </a>
                    </div>
                    <div className={"recent-post-time"}>
                        发表于{post.created_time ? post.created_time.toLocaleString():''}|
                        更新于{post.update_time ? post.update_time.toLocaleString(): ''}|
                        Java
                    </div>
                    <div className={"recent-post-summary"}>
                        {post.summary}
                    </div>
                </div>

            </div>
        </>
    )
}