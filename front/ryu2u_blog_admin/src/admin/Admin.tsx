import './Admin.scss'
import {useEffect, useState} from "react";
import {Outlet, useNavigate} from "react-router";
import {DynamicBreadcrumb} from "../comonents/DynamicBreadcrumb";

import {
    DashboardOutlined, InfoCircleOutlined, LoginOutlined,
    MessageOutlined, ReadOutlined, ReconciliationOutlined, UserOutlined,
} from '@ant-design/icons';
import {MenuProps, Tag} from 'antd';
import {Avatar, Button, Layout, Menu, theme} from 'antd';
import {createElement} from "react";
import LoginService from "../service/LoginService";

const {Header, Content, Footer, Sider} = Layout;

const items: MenuProps['items'] = [
    {
        key: "/dashboard",
        title: '仪表盘',
        label: "仪表盘",
        icon: createElement(DashboardOutlined),
        disabled: false,
        danger: false
    },
    {
        key: "/article/list",
        title: '文章',
        label: "文章",
        icon: createElement(ReadOutlined),
        disabled: false,
        danger: false
    },
    {
        key: "/user/list",
        title: '用户',
        label: "用户",
        icon: createElement(UserOutlined),
        disabled: false,
        danger: false
    },
    {
        key: "/comment",
        title: '评论',
        label: "评论",
        icon: createElement(MessageOutlined),
        disabled: false,
        danger: false
    },
    {
        key: "/moments",
        title: '说说',
        label: "说说",
        icon: createElement(ReconciliationOutlined),
        disabled: false,
        danger: false
    },
    {
        key: "/about",
        title: '关于',
        label: "关于",
        icon: createElement(InfoCircleOutlined),
        disabled: false,
        danger: false
    },
]


export function Admin() {

    const colorTheme = "dark";

    const {token: {}} = theme.useToken();

    const [collapsed, setCollapsed] = useState(false);

    const navigate = useNavigate();

    useEffect(() => {

        window.onresize = () => {
            if (window.innerWidth < 1100) {
                setCollapsed(true);
            } else {
                setCollapsed(false);
            }
        }

    }, []);

    const menuClick: MenuProps['onClick'] = (e) => {
        console.log('click ', e);
        navigate(e.key);
    };


    const logout = () => {
        LoginService.logout().then((res) => {
            if (res && res.code == 200) {
                navigate('/login');
            }
        });
    }

    return (
        <Layout hasSider className={"layout-div"}>
            <Sider
                theme={colorTheme}
                style={{
                    overflow: 'hidden',
                    height: '100vh',
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    transition: 'all 0.3s ease',
                    background: '#000000',
                }}
                collapsed={collapsed}
                collapsible
                onCollapse={(value) => setCollapsed(value)}
            >
                <div className="logo" style={{
                    textAlign: 'center',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: '#e0e0e0',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace",
                    borderBottom: '1px solid #333333',
                }}>
                    <span style={{ color: '#10a37f' }}>&gt;</span> admin{!collapsed && " ~"}
                </div>
                <Menu
                    theme={colorTheme}
                    mode="inline"
                    defaultSelectedKeys={['/dashboard']}
                    selectedKeys={[window.location.pathname]}
                    items={items}
                    onClick={menuClick}
                    style={{
                        marginTop: '16px',
                        height: 'calc(100vh - 80px)',
                        borderRight: 0,
                        overflow: 'auto',
                        background: '#000000',
                        fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace",
                    }}
                />
            </Sider>
            <Layout className={"layout-content"}
                    style={{
                        marginLeft: collapsed ? '80px' : '200px',
                        minHeight: '100vh',
                        transition: 'all 0.3s ease',
                        background: '#000000',
                    }}
            >
                <Header
                    className={"layout-header"}
                    style={{
                        padding: '0 24px',
                        background: '#000000',
                        borderBottom: '1px solid #333333',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        position: 'fixed',
                        top: 0,
                        left: collapsed ? '80px' : '200px',
                        right: 0,
                        zIndex: 100,
                        transition: 'all 0.3s ease',
                        fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace",
                    }}
                >
                    <div style={{fontSize: '14px', fontWeight: 500, color: '#e0e0e0'}}>
                        <span style={{ color: '#10a37f' }}>$</span> {(items as any)?.find((item: any) => item.key === window.location.pathname)?.label || '仪表盘'}
                    </div>
                    <div className="admin-header-actions">
                        <div className="admin-session-card">
                            <Avatar
                                size={32}
                                src={<img src="/react.svg" alt="avatar"/>}
                                className="admin-session-card__avatar"
                            />
                            <div className="admin-session-card__meta">
                                <div className="admin-session-card__label">active session</div>
                                <div className="admin-session-card__name-row">
                                    <span className="admin-session-card__name">Admin</span>
                                    <Tag className="admin-session-card__tag">
                                        root
                                    </Tag>
                                </div>
                            </div>
                        </div>
                        <Button
                            type="text"
                            icon={<LoginOutlined/>}
                            onClick={logout}
                            className="admin-header-exit-btn"
                        >
                            exit
                        </Button>
                    </div>
                </Header>
                <Content className={"content-div"} style={{
                    padding: '24px 0 0',
                    marginBottom: '0',
                    background: '#000000',
                }}>
                    <div
                        className={"container"}
                        style={{
                            background: '#000000',
                            borderRadius: 0,
                            padding: '24px',
                            border: '1px solid #333333',
                            fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace",
                        }}
                    >
                        <DynamicBreadcrumb/>
                        <Outlet/>
                    </div>
                </Content>
                <Footer className={"footer"} style={{
                    textAlign: 'center',
                    padding: '0 16px',
                    margin: '0',
                    background: '#000000',
                    color: '#bcc5d1',
                    borderTop: '1px solid #333333',
                    fontFamily: "Monaco, 'Courier New', 'Fira Code', monospace",
                    fontSize: '12px',
                }}>
                    $ echo "{new Date().getFullYear()} hai_tao@admin"
                </Footer>
            </Layout>
        </Layout>
    );
}
