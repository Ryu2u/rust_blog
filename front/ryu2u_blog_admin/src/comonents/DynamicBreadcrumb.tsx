import { Breadcrumb } from 'antd';
import { useLocation, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getFlattenRoutes } from '../common/routerConfig';

interface BreadcrumbItem {
    title: string;
    path?: string;
}

export function DynamicBreadcrumb() {
    const location = useLocation();
    const [items, setItems] = useState<BreadcrumbItem[]>([]);
    const flattenRoutes = getFlattenRoutes();

    useEffect(() => {
        let pathname = location.pathname;
        
        let matchedRoute = flattenRoutes.find(route => {
            if (route.path.includes(':')) {
                const routeParts = route.path.split('/');
                const pathParts = pathname.split('/');
                
                if (routeParts.length !== pathParts.length) return false;
                
                return routeParts.every((part, index) => {
                    return part.startsWith(':') || part === pathParts[index];
                });
            }
            return route.path === pathname;
        });

        if (matchedRoute) {
            setItems(matchedRoute.breadcrumb);
        } else {
            setItems([{ title: '首页', path: '/dashboard' }]);
        }
    }, [location.pathname, flattenRoutes]);

    return (
        <Breadcrumb style={{ marginBottom: 16 }}>
            {items.map((item, index) => (
                <Breadcrumb.Item key={index}>
                    {item.path ? (
                        <Link to={item.path}>{item.title}</Link>
                    ) : (
                        item.title
                    )}
                </Breadcrumb.Item>
            ))}
        </Breadcrumb>
    );
}
