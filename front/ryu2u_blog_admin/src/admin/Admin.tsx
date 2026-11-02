import './Admin.scss'
import {useEffect, useState} from "react";
import {Outlet, useNavigate} from "react-router";
import {DynamicBreadcrumb} from "../comonents/DynamicBreadcrumb";

import {
    DashboardOutlined, InfoCircleOutlined, LoginOutlined,
    MessageOutlined, ReadOutlined, ReconciliationOutlined, UserOutlined,
    CloudSyncOutlined,
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
        key: "/notesync",
        title: '同步设置',
        label: "同步设置",
        icon: createElement(CloudSyncOutlined),
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

    const colorTheme = "light";

    const {token: {}} = theme.useToken();

    const [collapsed, setCollapsed] = useState(false);
    const siderWidth = collapsed ? 72 : 220;

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
                className={"admin-sider"}
                width={220}
                collapsedWidth={72}
                collapsed={collapsed}
                collapsible
                onCollapse={(value) => setCollapsed(value)}
            >
                <div className="logo">
                    <span className="logo__mark">H</span>
                    {!collapsed && <span className="logo__text">博客后台</span>}
                </div>
                <Menu
                    theme={colorTheme}
                    mode="inline"
                    defaultSelectedKeys={['/dashboard']}
                    selectedKeys={[window.location.pathname]}
                    items={items}
                    onClick={menuClick}
                    className={"admin-menu"}
                />
            </Sider>
            <Layout className={"layout-content"} style={{marginLeft: siderWidth}}>
                <Header className={"layout-header"} style={{left: siderWidth}}>
                    <div className="admin-header-title">
                        {(items as any)?.find((item: any) => item.key === window.location.pathname)?.label || '仪表盘'}
                    </div>
                    <div className="admin-header-actions">
                        <div className="admin-session-card">
                            <Avatar
                                size={32}
                                src={<img src="/react.svg" alt="avatar"/>}
                                className="admin-session-card__avatar"
                            />
                            <span className="admin-session-card__name">Admin</span>
                            <Tag className="admin-tag admin-tag--active">管理员</Tag>
                        </div>
                        <Button
                            icon={<LoginOutlined/>}
                            onClick={logout}
                        >
                            退出登录
                        </Button>
                    </div>
                </Header>
                <Content className={"content-div"}>
                    <div className={"container"}>
                        <DynamicBreadcrumb/>
                        <Outlet/>
                    </div>
                </Content>
                <Footer className={"footer"}>
                    © {new Date().getFullYear()} Hai Tao · 博客后台
                </Footer>
            </Layout>
        </Layout>
    );
}
