import { List, Avatar } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import PostService from '../../service/PostService';
import DashboardService from '../../service/DashboardService';
import { PageInfo, Post, Result } from '../../common/Structs';

interface Article {
  id: number;
  title: string;
  author: string;
  created_time: string;
}

// GET /dashboard/admin/stats 的 obj；文章相关统计不含软删文章
interface DashboardStats {
  post_count: number;
  visit_count: number;
  last_update_time: number | null;
  user_count: number;
  comment_total: number;
  comment_pending: number;
  comment_approved: number;
  comment_rejected: number;
  version: string;
}

function formatDate(timestamp?: number | Date): string {
  if (!timestamp) return '-';
  const ts = typeof timestamp === 'number' ? timestamp : timestamp.getTime();
  const d = new Date(ts > 1e12 ? ts : ts * 1000);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [recentArticles, setRecentArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res: Result = await DashboardService.stats();
        if (res.code === 200 && res.obj) {
          setStats(res.obj);
        } else {
          setStatsFailed(true);
        }
      } catch (e) {
        console.error('Failed to fetch dashboard stats:', e);
        setStatsFailed(true);
      }
    };

    const fetchRecentPosts = async () => {
      try {
        const pageInfo = new PageInfo();
        pageInfo.page_num = 1;
        pageInfo.page_size = 5;
        const res: Result = await PostService.postListPage(pageInfo);
        if (res.code === 200 && res.obj?.list) {
          const articles: Article[] = res.obj.list.map((post: Post) => ({
            id: post.id ?? 0,
            title: post.title,
            author: post.author,
            created_time: formatDate(post.created_time),
          }));
          setRecentArticles(articles);
        }
      } catch (e) {
        console.error('Failed to fetch recent posts:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
    fetchRecentPosts();
  }, []);

  const serviceStatus = stats ? '运行中' : statsFailed ? '异常' : '-';

  return (
    <div>
      <div className="admin-page-head">
        <h2 className="admin-page-title">概览</h2>
      </div>

      {/* 统计 */}
      <div className="admin-stat-grid">
        {[
          { label: '文章', value: stats?.post_count },
          { label: '评论', value: stats?.comment_total },
          { label: '访问', value: stats?.visit_count },
          { label: '用户', value: stats?.user_count },
        ].map((stat) => (
          <div key={stat.label} className="admin-stat">
            <div className="admin-stat__label">{stat.label}</div>
            <div className="admin-stat__value">{stat.value?.toLocaleString() ?? '-'}</div>
          </div>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="dashboard-grid">
        {/* 最近文章 */}
        <div className="admin-panel">
          <h3 className="admin-panel__title">最近文章</h3>
          <List
            itemLayout="horizontal"
            dataSource={recentArticles}
            loading={loading}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <span key="date" className="dashboard-muted">
                    {item.created_time}
                  </span>
                ]}
              >
                <List.Item.Meta
                  avatar={<Avatar icon={<FileTextOutlined />} className="dashboard-post-avatar" />}
                  title={
                    <a href={`/article/edit/${item.id}`} className="dashboard-post-link">
                      {item.title}
                    </a>
                  }
                  description={<span className="dashboard-muted">{item.author}</span>}
                />
              </List.Item>
            )}
          />
        </div>

        {/* 系统信息 */}
        <div className="admin-panel">
          <h3 className="admin-panel__title">系统信息</h3>
          <dl className="dashboard-facts">
            <div><dt>服务状态</dt><dd className={stats ? 'dashboard-facts__ok' : undefined}>{serviceStatus}</dd></div>
            <div><dt>后端版本</dt><dd>{stats ? `v${stats.version}` : '-'}</dd></div>
            <div><dt>文章最近更新</dt><dd>{formatDate(stats?.last_update_time ?? undefined)}</dd></div>
            <div>
              <dt>评论审核</dt>
              <dd>
                {stats
                  ? `待审 ${stats.comment_pending} · 通过 ${stats.comment_approved} · 拒绝 ${stats.comment_rejected}`
                  : '-'}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
