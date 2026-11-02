import { List, Avatar, Progress } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useState, useEffect } from 'react';
import PostService from '../../service/PostService';
import { PageInfo, Post, Result } from '../../common/Structs';

interface Article {
  id: number;
  title: string;
  author: string;
  created_time: string;
}

function formatDate(timestamp?: number | Date): string {
  if (!timestamp) return '-';
  const ts = typeof timestamp === 'number' ? timestamp : timestamp.getTime();
  const d = new Date(ts > 1e12 ? ts : ts * 1000);
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function Dashboard() {
  const [articleCount, setArticleCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [visitsCount, setVisitsCount] = useState(0);
  const [userCount] = useState(1);
  const [recentArticles, setRecentArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setArticleCount(42);
    setCommentCount(156);
    setVisitsCount(3245);

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
    fetchRecentPosts();
  }, []);

  return (
    <div>
      <div className="admin-page-head">
        <h2 className="admin-page-title">概览</h2>
      </div>

      {/* 统计 */}
      <div className="admin-stat-grid">
        {[
          { label: '文章', value: articleCount },
          { label: '评论', value: commentCount },
          { label: '访问', value: visitsCount },
          { label: '用户', value: userCount },
        ].map((stat) => (
          <div key={stat.label} className="admin-stat">
            <div className="admin-stat__label">{stat.label}</div>
            <div className="admin-stat__value">{stat.value.toLocaleString()}</div>
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
          {[
            { label: '磁盘', percent: 65 },
            { label: '内存', percent: 42 },
            { label: 'CPU', percent: 28 },
          ].map((item) => (
            <div key={item.label} className="dashboard-usage">
              <div className="dashboard-usage__head">
                <span>{item.label}</span>
                <span>{item.percent}%</span>
              </div>
              <Progress percent={item.percent} showInfo={false} size="small" strokeColor="var(--color-primary)" trailColor="var(--color-surface-muted)" />
            </div>
          ))}
          <dl className="dashboard-facts">
            <div><dt>服务状态</dt><dd className="dashboard-facts__ok">运行中</dd></div>
            <div><dt>版本</dt><dd>v1.0.0</dd></div>
            <div><dt>最近更新</dt><dd>2024-01-24</dd></div>
          </dl>
        </div>
      </div>
    </div>
  )
}
