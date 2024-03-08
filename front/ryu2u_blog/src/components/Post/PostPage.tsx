import "./PostPage.scss"
import {FloatButton} from "antd";
import {QuestionCircleOutlined, SettingOutlined, SyncOutlined} from '@ant-design/icons';
import {useEffect, useRef, useState} from "react";
import {useParams} from "react-router";
import {Post} from "../../common/Structs";
import PostService from "../../service/PostService";

export function PostPage() {
    const [loading, setLoading] = useState(true);
    const postRef = useRef(new Post());
    // const [post, setPost] = useState(new Post());
    const param = useParams();

    useEffect(() => {
        const post_id = param['id'];
        console.log(`post_id : ${post_id}`);

        PostService.getPostById(6).then((result) => {
            console.log(result.obj);
            let data: Post = result.obj;
            data.created_time = new Date(data.created_time);
            data.update_time = new Date(data.update_time);
            postRef.current = data;
            console.log("post --> ")
            console.log(postRef);
            setTimeout(() => {
                setLoading(false);
            }, 1000)
        })

    }, [param])

    return (
        <>
            <Header/>
            <div className={"post-info"}>
                <div className={"post-title"}>
                    {postRef.current.title}
                </div>
                <div className={"post-meta"}>
                    <span className={"fa fa-calendar"}> </span>
                    发表于 {loading ? '' : postRef.current.created_time.toLocaleString()}|
                    <span className={"fa fa-history"}> </span>
                    更新于{loading ? '' : postRef.current.update_time.toLocaleString()} |
                    <span className={"fa fa-archive"}></span>
                    {postRef.current.category ? postRef.current.category : '未知分类'}
                </div>
            </div>

            <div className={"container flex"}>
                <div className={"content"}>
                    <div className={"markdown-body"} dangerouslySetInnerHTML={{
                        __html: postRef.current.format_content
                    }}>
                    </div>
                </div>

                <SideBar/>
            </div>

            <Footer/>

            <FloatButton.Group shape="square" style={{right: 50}}>
                <FloatButton icon={<QuestionCircleOutlined/>}/>
                <FloatButton icon={<SettingOutlined spin/>}/>
                <FloatButton icon={<SyncOutlined/>}/>
                <FloatButton.BackTop visibilityHeight={0}/>
            </FloatButton.Group>
        </>
    )
}