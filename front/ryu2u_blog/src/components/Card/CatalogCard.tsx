import {CatalogItem} from "../Post/PostPage";
import {useEffect, useState} from "react";
import './Card.scss'

export function CatalogCard({catalogJson}) {

    const [catalog, setCatalog] = useState("");

    useEffect(() => {
        let tree = JSON.parse(catalogJson);
        console.log("catalog => ");
        console.log(tree);
        let domTree = getChapterDomTree(tree);
        console.log("dom Tree => ");
        console.log(domTree);
        setCatalog(domTree.innerHTML);
    }, [catalogJson]);


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

    // 根据html字符串生成dom元素
    function createNodeByHtmlStr(htmlStr: string): HTMLCollection {
        let div = document.createElement('div');
        div.innerHTML = htmlStr;
        return div.children;
    }


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