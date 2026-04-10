/**
 * 文章详情页组件
 * 显示文章内容、目录及相关信息
 */
import "./PostPage.scss"
import {useEffect, useRef, useState} from "react";
import {useParams} from "react-router";
import {Post, Comment} from "../../common/Structs";
import PostService from "../../service/PostService";
import CommentService from "../../service/CommentService";
import {SideBar} from "../SideBar";
import {CatalogCard} from "../Card/CatalogCard";
import "../../home/md.scss"

/**
 * 目录项接口
 * @interface CatalogItem
 * @property {number} hNum - 标题级别 (1-6)
 * @property {number} id - 标题唯一标识
 * @property {string} title - 标题内容
 * @property {number} [level] - 目录层级
 * @property {CatalogItem[]} [children] - 子目录项
 */
export interface CatalogItem {
    hNum: number;
    id: number;
    title: string;
    level?: number;
    children?: CatalogItem[];
}

/**
 * 文章详情页组件函数
 * @returns {JSX.Element} 文章详情页渲染结果
 */
export function PostPage() {
    const [loading, setLoading] = useState(true);
    const post_content_ref = useRef<HTMLDivElement | null>(null);
    const postRef = useRef(new Post());
    const param = useParams();
    const [catalogJson, setCatalogJson] = useState("");

    // 评论相关状态
    const [comments, setComments] = useState<Comment[]>([]);
    const [userEmail, setUserEmail] = useState("");
    const [userName, setUserName] = useState("");
    const [commentContent, setCommentContent] = useState("");
    const [commentLoading, setCommentLoading] = useState(false);

    /**
     * 将扁平的目录数组转换为树形结构
     * @param {CatalogItem[]} flatArr - 扁平的目录项数组
     * @returns {CatalogItem[]} 转换后的树形目录结构
     */
    function toTree(flatArr: CatalogItem[]): CatalogItem[] {
        let tree: CatalogItem[] = [];
        let copyArr: CatalogItem[] = flatArr.map((item: CatalogItem) => ({...item}));

        /**
         * 根据级别获取子目录项
         * @param {CatalogItem | undefined} currentLevelItem - 当前级别项
         * @param {CatalogItem[]} arr - 待处理的目录项数组
         * @param {number} level - 当前层级
         * @returns {CatalogItem[]} 子目录项数组
         */
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

        /**
         * 递归构建目录树
         * @param {CatalogItem[]} result - 结果数组
         * @param {CatalogItem[]} arr - 待处理的目录项数组
         * @param {number} level - 当前层级
         * @returns {void}
         */
        const getTree = (result: CatalogItem[], arr: CatalogItem[], level: number): void => {
            let currentItem = arr.shift();
            if (!currentItem) return;

            currentItem.level = level;
            result.push(currentItem);
            while (arr.length > 0) {
                let children = getChildrenByLevel(currentItem, arr, level);
                if (children.length == 0) {
                    // @ts-ignore
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

        PostService.getPostById(Number(post_id)).then((result) => {
            console.log(result.obj);
            let data: Post = result.obj;
            data.created_time = new Date(data.created_time);
            data.update_time = new Date(data.update_time);
            postRef.current = data;
            genToc();
        })

    }, [param])

    // 加载评论列表
    useEffect(() => {
        const post_id = param['id'];
        if (post_id) {
            loadComments(Number(post_id));
        }
    }, [param]);

    function loadComments(postId: number) {
        CommentService.getCommentList(postId).then((result) => {
            if (result.code === 200) {
                setComments(result.obj || []);
            }
        });
    }

    // 邮箱变化时提取用户名
    function handleEmailChange(email: string) {
        setUserEmail(email);
        const atIndex = email.indexOf('@');
        if (atIndex > 0) {
            setUserName(email.substring(0, atIndex));
        }
    }

    // 提交评论
    function handleSubmitComment() {
        const post_id = param['id'];
        if (!post_id || !userEmail || !userName || !commentContent) {
            alert("请填写完整信息");
            return;
        }

        setCommentLoading(true);
        const comment = new Comment();
        comment.post_id = Number(post_id);
        comment.user_email = userEmail;
        comment.user_name = userName;
        comment.content = commentContent;

        CommentService.addComment(comment).then((result) => {
            setCommentLoading(false);
            if (result.code === 200) {
                setCommentContent("");
                loadComments(Number(post_id));
            } else {
                alert(result.msg);
            }
        });
    }

    /**
     * 生成文章目录
     * 解析文章内容中的标题标签，生成目录结构并设置到状态中
     * @returns {void}
     */
    function genToc() {
        let div = post_content_ref.current;
        let hLevel: CatalogItem[] = [];

        div?.childNodes.forEach((e, index) => {
            const titleTag = ["H1", "H2", "H3", "H4", "H5", "H6"];
            if (titleTag.includes(e.nodeName)) {
                const htmlElement = e as HTMLElement;
                if (e.nodeName == "H1") {
                    hLevel.push({hNum: 1, title: htmlElement.innerText, id: index});
                } else if (e.nodeName == "H2") {
                    hLevel.push({hNum: 2, title: htmlElement.innerText, id: index});
                } else if (e.nodeName == "H3") {
                    hLevel.push({hNum: 3, title: htmlElement.innerText, id: index});
                } else if (e.nodeName == "H4") {
                    hLevel.push({hNum: 4, title: htmlElement.innerText, id: index});
                } else if (e.nodeName == "H5") {
                    hLevel.push({hNum: 5, title: htmlElement.innerText, id: index});
                } else if (e.nodeName == "H6") {
                    hLevel.push({hNum: 6, title: htmlElement.innerText, id: index});
                }
                const id = "header-" + index;
                htmlElement.setAttribute("id", id);
            }
        });
        let tree = toTree(hLevel);
        setCatalogJson(JSON.stringify(tree));
        setLoading(false);
    }

    return (
        <>
            <div className="container flex">
                {!loading && (
                    <div className="side-list left-sidebar">
                        <div className="catalog">
                            <CatalogCard catalogJson={catalogJson}/>
                        </div>
                    </div>
                )}
                <div className="post-main">
                    {loading ? (
                        <div className="loading-container flex justify-center items-center" style={{padding: '60px 0'}}>
                            <div className="loading-spinner">加载中...</div>
                        </div>
                    ) : (
                        <>
                            <div className="post-info">
                                <div className="post-title">
                                    {postRef.current.title}
                                </div>
                                <div className="post-meta">
                                    <span className="fa fa-calendar"> </span>
                                    发表于{postRef.current.created_time.toLocaleString()}|
                                    <span className="fa fa-history"> </span>
                                    更新于{postRef.current.update_time.toLocaleString()} |
                                    <span className="fa fa-archive"></span>
                                    {postRef.current.category ? postRef.current.category : '未知分类'}
                                </div>
                            </div>

                            <div className="content">
                                <div ref={post_content_ref} id="post-content" className="markdown-body"
                                     dangerouslySetInnerHTML={{
                                         __html: postRef.current.format_content
                                     }}>
                                </div>
                            </div>

                            {/* 评论区域 */}
                            <div className="comment-section">
                                <h3>评论</h3>
                                <div className="comment-form">
                                    <div className="form-group">
                                        <label>邮箱：</label>
                                        <input
                                            type="email"
                                            value={userEmail}
                                            onChange={(e) => handleEmailChange(e.target.value)}
                                            placeholder="请输入邮箱"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>昵称：</label>
                                        <input
                                            type="text"
                                            value={userName}
                                            onChange={(e) => setUserName(e.target.value)}
                                            placeholder="请输入昵称"
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>评论内容：</label>
                                        <textarea
                                            value={commentContent}
                                            onChange={(e) => setCommentContent(e.target.value)}
                                            placeholder="请输入评论内容"
                                            rows={4}
                                        />
                                    </div>
                                    <button
                                        className="comment-submit-btn"
                                        onClick={handleSubmitComment}
                                        disabled={commentLoading}
                                    >
                                        {commentLoading ? "提交中..." : "提交评论"}
                                    </button>
                                </div>

                                {/* 评论列表 */}
                                <div className="comment-list">
                                    <h4>评论列表 ({comments.length})</h4>
                                    {comments.length === 0 ? (
                                        <p className="no-comment">暂无评论，快来抢沙发吧！</p>
                                    ) : (
                                        comments.map((comment) => (
                                            <div key={comment.id} className="comment-item">
                                                <div className="comment-header">
                                                    <span className="comment-user">{comment.user_name}</span>
                                                    <span className="comment-email">({comment.user_email})</span>
                                                    <span className="comment-time">
                                                        {comment.created_time ? new Date(comment.created_time).toLocaleString() : ''}
                                                    </span>
                                                </div>
                                                <div className="comment-body">
                                                    {comment.content}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {!loading && <SideBar catalogJson={catalogJson}/>}
            </div>
        </>
    )
}