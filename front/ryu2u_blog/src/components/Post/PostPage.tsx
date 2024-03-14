import "./PostPage.scss"
import {FloatButton} from "antd";
import {QuestionCircleOutlined, SettingOutlined, SyncOutlined} from '@ant-design/icons';
import {useEffect, useRef, useState} from "react";
import {useParams} from "react-router";
import {Post} from "../../common/Structs";
import PostService from "../../service/PostService";
import {Header} from "../Header";
import {Footer} from "../Footer";
import {SideBar} from "../SideBar";
import "../../home/md.scss"

export interface CatalogItem {
    hNum: number;
    id: number;
    title: string;
    level?: number;
    children?: CatalogItem[];
}

export function PostPage() {
    const [loading, setLoading] = useState(true);
    const post_content_ref = useRef<HTMLDivElement | null>(null);
    const postRef = useRef(new Post());
    const param = useParams();
    const [catalogJson, setCatalogJson] = useState("");

    function toTree(flatArr: CatalogItem[]): CatalogItem[] {
        let tree: CatalogItem[] = [];
        let copyArr: CatalogItem[] = flatArr.map((item: CatalogItem) => ({...item}));

        const getChildrenByLevel = (currentLevelItem: CatalogItem | undefined, arr: CatalogItem[], level: number): CatalogItem[] => {
            if (!currentLevelItem) {
                return [];
            }
            let minusCurrentLevel = -currentLevelItem.hNum;
            let children: CatalogItem[] = [];
            for (let i = 0, len = arr.length; i < len; i++) {
                let levelItem = arr[i];
                if (-levelItem.hNum < minusCurrentLevel) {
                    children.push(levelItem);
                } else {
                    break;
                }
            }
            if (children.length > 0) {
                arr.splice(0, children.length);
            }
            return children;
        };

        const getTree = (result: CatalogItem[], arr: CatalogItem[], level: number): void => {
            let currentItem = arr.shift();
            if (!currentItem) return;

            currentItem.level = level;
            result.push(currentItem);
            while (arr.length > 0) {
                let children = getChildrenByLevel(currentItem, arr, level);
                if (children.length == 0) {
                    currentItem = arr.shift();
                    if (!currentItem) return;

                    currentItem.level = level;
                    result.push(currentItem);
                    continue;
                }
                currentItem.children = [];
                getTree(currentItem.children, children, level + 1);
            }
        };
        getTree(tree, copyArr, 1);

        return tree;
    }

    useEffect(() => {
        const post_id = param['id'];
        console.log(`post_id : ${post_id}`);

        PostService.getPostById(post_id).then((result) => {
            console.log(result.obj);
            let data: Post = result.obj;
            data.created_time = new Date(data.created_time);
            data.update_time = new Date(data.update_time);
            postRef.current = data;
            genToc();
        })

    }, [post_content_ref.current])

    function genToc() {
        let div = post_content_ref.current;
        let hLevel: CatalogItem[] = [];
        // @ts-ignore
        div?.childNodes.forEach((e, index) => {
            const titleTag = ["H1", "H2", "H3", "H4", "H5", "H6"];
            if (titleTag.includes(e.nodeName)) {
                if (e.nodeName == "H1") {
                    hLevel.push({hNum: 1, title: e.innerText, id: index});
                } else if (e.nodeName == "H2") {
                    hLevel.push({hNum: 2, title: e.innerText, id: index})
                } else if (e.nodeName == "H3") {
                    hLevel.push({hNum: 3, title: e.innerText, id: index})
                } else if (e.nodeName == "H4") {
                    hLevel.push({hNum: 4, title: e.innerText, id: index})
                } else if (e.nodeName == "H5") {
                    hLevel.push({hNum: 5, title: e.innerText, id: index})
                } else if (e.nodeName == "H6") {
                    hLevel.push({hNum: 6, title: e.innerText, id: index})
                }
                const id = "header-" + index;
                e.setAttribute("id", id);
            }
        });
        let tree = toTree(hLevel);
        setCatalogJson(JSON.stringify(tree));
        setLoading(false);
    }

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
                    <div ref={post_content_ref} id={"post-content"} data-theme="light" className={"markdown-body"} dangerouslySetInnerHTML={{
                        __html: postRef.current.format_content
                    }}>
                    </div>
                </div>

                <SideBar catalogJson={catalogJson}/>
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