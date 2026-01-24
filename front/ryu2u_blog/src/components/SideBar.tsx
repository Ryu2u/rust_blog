/**
 * 侧边栏组件
 * 显示用户信息、天气卡片和目录卡片
 */
import {Weather} from "./Weather";
import {useEffect, useState} from "react";
import {UserInfo} from "./UserInfo/UserInfo";
import {Card} from "./Card/Card";
import {CatalogCard} from "./Card/CatalogCard";

/**
 * 侧边栏组件函数
 * @param {Object} props - 组件属性
 * @param {string} props.catalogJson - 目录JSON字符串
 * @returns {JSX.Element} 侧边栏组件渲染结果
 */
export function SideBar({catalogJson}) {

    const [viewToc, setViewToc] = useState(false);

    /**
     * 监听目录JSON变化，控制目录显示
     * @returns {void}
     */
    useEffect(() => {
        if (catalogJson && catalogJson != '') {
            setViewToc(true);
        }
    }, [catalogJson]);

    return (
        <>
            <div className={"side-list"}>
                <UserInfo/>
                <Weather/>
            </div>

        </>
    )
}