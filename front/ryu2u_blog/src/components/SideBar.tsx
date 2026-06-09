/**
 * 侧边栏组件
 * 显示用户信息、天气卡片和目录卡片
 */
import "./SideBar.scss";
import {Weather} from "./Weather";
import {useNavigate} from "react-router";
import {UserInfo} from "./UserInfo/UserInfo";

interface SideBarProps {
    catalogJson: string;
    homeMeta?: {
        postCount: number;
        categoryCount: number;
        totalWords: number;
        totalVisits: number;
        featuredTitle?: string;
    };
}

/**
 * 侧边栏组件函数
 * @param {Object} props - 组件属性
 * @param {string} props.catalogJson - 目录JSON字符串
 * @returns {JSX.Element} 侧边栏组件渲染结果
 */
export function SideBar({homeMeta}: SideBarProps) {
    const navigate = useNavigate();

    return (
        <>
            <div className={"side-list"}>
                <UserInfo/>
                <Weather/>
                {homeMeta && (
                    <>
                        <section className="side-widget">
                            <div className="side-widget__title">
                                <span className="side-widget__prompt">$</span> blog status
                            </div>
                            <div className="side-metric-grid">
                                <div className="side-metric">
                                    <span>文章</span>
                                    <strong>{homeMeta.postCount}</strong>
                                </div>
                                <div className="side-metric">
                                    <span>分类</span>
                                    <strong>{homeMeta.categoryCount}</strong>
                                </div>
                                <div className="side-metric">
                                    <span>字数</span>
                                    <strong>{homeMeta.totalWords.toLocaleString()}</strong>
                                </div>
                                <div className="side-metric">
                                    <span>访问</span>
                                    <strong>{homeMeta.totalVisits.toLocaleString()}</strong>
                                </div>
                            </div>
                        </section>

                        <section className="side-widget">
                            <div className="side-widget__title">
                                <span className="side-widget__prompt">&gt;</span> quick links
                            </div>
                            <div className="side-widget__body">
                                <p className="side-widget__copy">
                                    首页更适合慢慢逛。可以先从分类进入，也可以直接继续读最近更新。
                                </p>
                                {homeMeta.featuredTitle && (
                                    <div className="side-widget__current">
                                        当前推荐：{homeMeta.featuredTitle}
                                    </div>
                                )}
                                <div className="side-widget__actions">
                                    <button type="button" onClick={() => navigate('/category')}>
                                        浏览分类
                                    </button>
                                    <button type="button" onClick={() => navigate('/home')}>
                                        回到首页顶部
                                    </button>
                                </div>
                            </div>
                        </section>
                    </>
                )}
            </div>

        </>
    )
}
