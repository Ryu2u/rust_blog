import './home.scss'
import {useEffect, useState, useCallback} from "react";
import {SideBar} from "../components/SideBar";
import PostService from "../service/PostService";
import {PageInfo, Post} from "../common/Structs";
import {PostListItem} from "../components/PostListItem/PostListItem";
import {FloatList} from "../components/FloatList";

export function Home() {

    const [postList, setPostList] = useState<Post[]>([])
    const [pageInfo, setPageInfo] = useState(new PageInfo());

    const getPageList = useCallback((pageNum: number, pageSize: number) => {
        const pageInfo = new PageInfo();
        pageInfo.page_num = pageNum;
        pageInfo.page_size = pageSize;
        pageInfo.total = 0;
        pageInfo.list = [];
        PostService.postListPage(pageInfo).then((result) => {
            const pageInfo: PageInfo = result.obj;
            setPageInfo(pageInfo);
            setPostList(pageInfo.list);
            console.log("list => ");
            console.log(pageInfo.list);
        });
    }, []);

    useEffect(() => {
        getPageList(1, 10);

    }, [getPageList])




    return (
        <>
            <div className={"container flex"}>
                <div className={"post-list"}>
                    {
                        postList.map((item, index) => (
                            <PostListItem key={item.id} dir={index % 2 == 0} postItemJson={JSON.stringify(item)}/>
                        ))
                    }

                    <div className={"pagination-div"}>
                        <ul className="pagination">
                            {
                                (pageInfo.page_num > 1) &&
                                <li><a href="#" onClick={() => getPageList(pageInfo.page_num - 1, pageInfo.page_size)}>«</a></li>
                            }
                            <li><a href="#" className={"active"}>{pageInfo.page_num}</a></li>
                            {
                                (pageInfo.page_num * pageInfo.page_size < pageInfo.total) &&
                                <>
                                    <li><a href="#" onClick={() => getPageList(pageInfo.page_num + 1, pageInfo.page_size)}>{pageInfo.page_num + 1}</a></li>
                                    <li><a href="#" onClick={() => getPageList(pageInfo.page_num + 1, pageInfo.page_size)}>»</a></li>
                                </>
                            }
                        </ul>
                    </div>
                </div>

                <SideBar catalogJson={""}/>
            </div>

            <FloatList/>

        </>
    )
}