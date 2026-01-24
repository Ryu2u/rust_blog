/**
 * 目录卡片组件
 * 显示文章的目录结构，支持层级嵌套
 */
import {CatalogItem} from "../Post/PostPage";
import {useEffect, useState} from "react";
import './Card.scss'

/**
 * 目录卡片组件函数
 * @param {Object} props - 组件属性
 * @param {string} props.catalogJson - 目录JSON字符串
 * @returns {JSX.Element} 目录卡片组件渲染结果
 */
export function CatalogCard({catalogJson}) {

    const [catalog, setCatalog] = useState("");

    /**
     * 监听目录JSON变化，生成目录DOM结构
     */
    useEffect(() => {
        let tree = JSON.parse(catalogJson);
        console.log("catalog => ");
        console.log(tree);
        let domTree = getChapterDomTree(tree);
        console.log("dom Tree => ");
        console.log(domTree);
        setCatalog(domTree.innerHTML);
    }, [catalogJson]);

    /**
     * 递归生成目录DOM树
     * @param {CatalogItem[]} chapterTreeData - 目录树数据
     * @param {HTMLElement} [parentNode] - 父DOM节点
     * @returns {HTMLElement} 生成的目录DOM树
     */
    function getChapterDomTree(chapterTreeData: CatalogItem[], parentNode?: HTMLElement): HTMLElement {
        if (!parentNode) {
            parentNode = createNodeByHtmlStr('<ul class="markdown-toc-list"></ul>')[0] as HTMLElement;
        }
        chapterTreeData.forEach(chapterItem => {
            let itemDom = createNodeByHtmlStr(`<li class=""><a class="toc-level-${chapterItem.level}" href="#header-${chapterItem.id}"><div class="toc-li">${chapterItem.title}</div></a></li>`)[0] as HTMLElement;
            parentNode!.appendChild(itemDom);
            if (chapterItem.children) {
                let catalogList = createNodeByHtmlStr('<ul class="markdown-toc-list"></ul>')[0] as HTMLElement;
                itemDom.appendChild(catalogList);
                getChapterDomTree(chapterItem.children, catalogList);
            }
        });
        return parentNode;
    }

    /**
     * 根据HTML字符串生成DOM元素
     * @param {string} htmlStr - HTML字符串
     * @returns {HTMLCollection} 生成的DOM元素集合
     */
    function createNodeByHtmlStr(htmlStr: string): HTMLCollection {
        let div = document.createElement('div');
        div.innerHTML = htmlStr;
        return div.children;
    }

    /**
     * 渲染目录卡片
     * @returns {JSX.Element} 目录卡片组件
     */
    return (
        <>
            <div className={"card-widget catalog-card"}>
                <h3>目录</h3>
                <div dangerouslySetInnerHTML={{
                    __html: catalog
                }}>
                </div>
            </div>
        </>
    )
}