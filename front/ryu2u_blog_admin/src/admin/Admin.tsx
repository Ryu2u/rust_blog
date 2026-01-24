import './Admin.scss'
import {useEffect, useState} from "react";
import {Outlet, useNavigate} from "react-router";

import {
    DashboardOutlined, InfoCircleOutlined, LoginOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined, MessageOutlined, ReadOutlined, ReconciliationOutlined, UserOutlined,
} from '@ant-design/icons';
import {MenuProps, Tag} from 'antd';
import {Avatar, Button, Layout, Menu, theme} from 'antd';
import {createElement} from "react";
import LoginService from "../service/LoginService";

const {Header, Content, Footer, Sider} = Layout;

const items: MenuProps['items'] = [
    {
        key: "/dashboard", // item 唯一标志
        title: '仪表盘', // 设置收缩时展示的悬浮标题
        label: "仪表盘", // 菜单显示在界面上的标题项
        icon: createElement(DashboardOutlined), // 图标
        disabled: false, // 是否禁用
        danger: false // 展示错误状态样式
    },
    {
        key: "/article/list", // item 唯一标志
        title: '文章', // 设置收缩时展示的悬浮标题
        label: "文章", // 菜单显示在界面上的标题项
        icon: createElement(ReadOutlined), // 图标
        disabled: false, // 是否禁用
        danger: false // 展示错误状态样式
    },
    {
        key: "/user/list", // item 唯一标志
        title: '用户', // 设置收缩时展示的悬浮标题
        label: "用户", // 菜单显示在界面上的标题项
        icon: createElement(UserOutlined), // 图标
        disabled: false, // 是否禁用
        danger: false // 展示错误状态样式
    },
    {
        key: "/comment", // item 唯一标志
        title: '评论', // 设置收缩时展示的悬浮标题
        label: "评论", // 菜单显示在界面上的标题项
        icon: createElement(MessageOutlined), // 图标
        disabled: false, // 是否禁用
        danger: false // 展示错误状态样式
    },
    {
        key: "/moments", // item 唯一标志
        title: '说说', // 设置收缩时展示的悬浮标题
        label: "说说", // 菜单显示在界面上的标题项
        icon: createElement(ReconciliationOutlined), // 图标
        disabled: false, // 是否禁用
        danger: false // 展示错误状态样式
    },
    {
        key: "/about", // item 唯一标志
        title: '关于', // 设置收缩时展示的悬浮标题
        label: "关于", // 菜单显示在界面上的标题项
        icon: createElement(InfoCircleOutlined), // 图标
        disabled: false, // 是否禁用
        danger: false // 展示错误状态样式
    },

]


export function Admin() {

    const colorTheme = "light";

    const {token: {colorBgContainer, borderRadiusLG},} = theme.useToken();

    const [collapsed, setCollapsed] = useState(false);

    const navigate = useNavigate();

    const toggleCollapsed = () => {
        setCollapsed(!collapsed);
    };

    useEffect(() => {

        window.onresize = () => {
            // console.log(window.innerWidth);
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
                    transition: 'all 0.3s ease'
                }}
                collapsed={collapsed}
                collapsible
                onCollapse={(value) => setCollapsed(value)}
            >
                <div className="logo" style={{
                    textAlign: 'center',
                    padding: '16px 0',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: '#1890ff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden'
                }}>
                    Ryu2u{!collapsed && " の 后台"}
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
                        overflow: 'auto'
                    }}
                />
            </Sider>
            <Layout className={"layout-content"}
                    style={{
                        marginLeft: collapsed ? '80px' : '200px',
                        minHeight: '99vh',
                        transition: 'all 0.3s ease'
                    }}
            >
                <Header
                    className={"layout-header"}
                    style={{
                        padding: '0 24px',
                        background: colorBgContainer,
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.09)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        position: 'fixed',
                        top: 0,
                        left: collapsed ? '80px' : '200px',
                        right: 0,
                        zIndex: 100,
                        transition: 'all 0.3s ease'
                    }}
                >
                    <div style={{fontSize: '16px', fontWeight: '500'}}>
                        {items.find(item => item.key === window.location.pathname)?.label || '仪表盘'}
                    </div>
                    <div style={{display: 'flex', alignItems: 'center'}}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginRight: '16px'
                        }}>
                            <Avatar
                                size={32}
                                src={<img src="/react.svg" alt="avatar"/>}
                                style={{
                                    cursor: 'pointer',
                                    border: '1px solid #e8e8e8',
                                    marginRight: '12px'
                                }}
                            />
                            <div style={{fontWeight: '500',marginRight: '5px'}}>
                                Admin
                            </div>
                            <Tag variant={'solid'}>
                                系统管理员
                            </Tag>
                        </div>
                        <Button
                            type="text"
                            icon={<LoginOutlined/>}
                            onClick={logout}
                        >
                            退出登录
                        </Button>
                    </div>
                </Header>
                <Content className={"content-div"} style={{
                    padding: '32px 0',
                    marginBottom: '0'
                }}>
                    <div
                        className={"container"}
                        style={{
                            background: colorBgContainer,
                            borderRadius: borderRadiusLG,
                            padding: '24px',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)'
                        }}
                    >
                        <Outlet/>
                    </div>
                </Content>
                <Footer className={"footer"} style={{textAlign: 'center', padding: '16px', margin: '0'}}>
                    Ant Design ©{new Date().getFullYear()} Created by Ant UED
                </Footer>
            </Layout>
        </Layout>
    );
}