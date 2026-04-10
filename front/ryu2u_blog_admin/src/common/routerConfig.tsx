import {Dashboard} from "../admin/dashboard/Dashboard";
import {ArticleEditPage} from "../admin/article/ArticleEditPage";
import {CommentPage} from "../admin/comment/CommentPage";
import {MomentsPage} from "../admin/moments/MomentsPage";
import {ArticleListPage} from "../admin/article/ArticleListPage";
import {ArticlePage} from "../admin/article/ArticlePage";
import {UserListPage} from "../admin/user/UserListPage";
import {UserEditPage} from "../admin/user/UserEditPage";

interface RouteConfig {
    path: string;
    element: React.ComponentType;
    breadcrumb: { title: string; path?: string }[];
    children?: RouteConfig[];
}

export const routeConfig: RouteConfig[] = [
    {
        path: '/dashboard',
        element: Dashboard,
        breadcrumb: [
            { title: '首页', path: '/dashboard' }
        ]
    },
    {
        path: '/article',
        element: ArticlePage,
        breadcrumb: [
            { title: '首页', path: '/dashboard' },
            { title: '文章管理' }
        ],
        children: [
            {
                path: '/article/list',
                element: ArticleListPage,
                breadcrumb: [
                    { title: '首页', path: '/dashboard' },
                    { title: '文章管理' }
                ]
            }
        ]
    },
    {
        path: '/article/new',
        element: ArticleEditPage,
        breadcrumb: [
            { title: '首页', path: '/dashboard' },
            { title: '文章管理', path: '/article/list' },
            { title: '新建文章' }
        ]
    },
    {
        path: '/article/edit/:id',
        element: ArticleEditPage,
        breadcrumb: [
            { title: '首页', path: '/dashboard' },
            { title: '文章管理', path: '/article/list' },
            { title: '编辑文章' }
        ]
    },
    {
        path: '/user/list',
        element: UserListPage,
        breadcrumb: [
            { title: '首页', path: '/dashboard' },
            { title: '用户管理' }
        ]
    },
    {
        path: '/user/edit',
        element: UserEditPage,
        breadcrumb: [
            { title: '首页', path: '/dashboard' },
            { title: '用户管理', path: '/user/list' },
            { title: '新建用户' }
        ]
    },
    {
        path: '/user/edit/:id',
        element: UserEditPage,
        breadcrumb: [
            { title: '首页', path: '/dashboard' },
            { title: '用户管理', path: '/user/list' },
            { title: '编辑用户' }
        ]
    },
    {
        path: '/comment',
        element: CommentPage,
        breadcrumb: [
            { title: '首页', path: '/dashboard' },
            { title: '评论管理' }
        ]
    },
    {
        path: '/moments',
        element: MomentsPage,
        breadcrumb: [
            { title: '首页', path: '/dashboard' },
            { title: '说说管理' }
        ]
    }
];

export function getFlattenRoutes(): RouteConfig[] {
    const result: RouteConfig[] = [];
    
    function flatten(routes: RouteConfig[]) {
        for (const route of routes) {
            result.push(route);
            if (route.children) {
                flatten(route.children);
            }
        }
    }
    
    flatten(routeConfig);
    return result;
}
