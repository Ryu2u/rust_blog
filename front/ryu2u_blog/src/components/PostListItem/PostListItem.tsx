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


    const postClick = () => {
        navigate(`/post/${post.id}`);
    }

    return (
        <>
            <div className={dir ? 'post-list-item' : 'post-list-item post-left'}>
                <div className={"post-bg"}>
                    <a onClick={postClick} href={""}>
                        <img alt={"post-alt"} src={post.cover_img ? post.cover_img : "https://ryu2u-1305537946.cos.ap-nanjing.myqcloud.com//5.jpg"}/>
                    </a>
                </div>
                <div className={"post-divider"}>
                </div>
                <div className={"recent-post-info"}>
                    <div className={"recent-post-title"}>
                        <a onClick={postClick} href={""} className={"recent-post-title-a"}>
                            {post.title}
                        </a>
                    </div>
                    <div className="recent-post-time">
                        <div>发表于{post.created_time ? formatDate(post.created_time as Date) : ''}</div>
                        <div>更新于{post.update_time ? formatDate(post.update_time as Date) : ''}</div>
                        <div>类型</div>
                    </div>
                    {/*<div className={"recent-post-summary"}>*/}
                    {/*    {post.summary}*/}
                    {/*</div>*/}
                </div>

            </div>
        </>
    )
}