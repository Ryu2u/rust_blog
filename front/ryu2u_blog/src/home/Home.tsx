import './home.scss'
import {FloatButton} from "antd";
import {QuestionCircleOutlined, SettingOutlined, SyncOutlined} from '@ant-design/icons';
import {useEffect} from "react";
import './md.scss'
import {Header} from "../components/Header";
import {Footer} from "../components/Footer";
import {SideBar} from "../components/SideBar";
import PostService from "../service/PostService";
import {PageInfo} from "../common/Structs";
import {PostListItem} from "../components/PostListItem/PostListItem";

export function Home() {


    useEffect(() => {
        let pageInfo = new PageInfo();
        pageInfo.page_num = 1;
        pageInfo.page_size = 10;
        pageInfo.total = 0;
        pageInfo.list = [];
        PostService.postListPage(pageInfo).then((result) => {
            console.log(result.obj) ;
        });


    }, [])


    return (
        <>
            <Header/>

            <div className={"container flex"}>
                <div className={"post-list"}>
                    <PostListItem dir={true}/>
                    <PostListItem dir={false}/>

                    <PostListItem dir={true}/>
                    <PostListItem dir={false}/>

                    <PostListItem dir={true}/>
                    <PostListItem dir={false}/>

                    <PostListItem dir={true}/>
                    <PostListItem dir={false}/>

                    <PostListItem dir={true}/>
                    <PostListItem dir={false}/>

                    <PostListItem dir={true}/>
                    <PostListItem dir={false}/>

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