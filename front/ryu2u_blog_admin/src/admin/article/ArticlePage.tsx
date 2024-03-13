import {Button} from "antd";
import { PlusOutlined, SaveOutlined} from "@ant-design/icons";
import {Outlet, useNavigate} from "react-router";
import {useEffect} from "react";
import './ArticlePage.scss'

export function ArticlePage() {

    const navigate = useNavigate();

    useEffect(() => {

    }, [])

    const toArticleEdit = () => {
        navigate("/article/new");
    }

    return (
        <>
            <div className={"article-tool-div"}>
                <Button type={"default"}>
                    <SaveOutlined/>
                    保留
                </Button>
                <Button type={"primary"} onClick={toArticleEdit}>
                    <PlusOutlined/>
                    新建
                </Button>
            </div>
            <div className={"article-content-div"}>
                <Outlet/>
            </div>
        </>
    );
}