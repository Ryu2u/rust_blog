import './ArticlePage.scss'
import {Table, TableProps, Tag} from "antd";
import {useEffect, useRef, useState} from "react";
import {PageInfo, Post} from "../../common/Structs";
import PostService from "../../service/PostService";
import {formatDate} from "../../common/utils";
import {EyeInvisibleOutlined, EyeOutlined} from "@ant-design/icons";
import {useNavigate} from "react-router";


export const ArticleListPage = () => {

    const pageInfoRef = useRef(new PageInfo());
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const titleClick = (value: Post) => {
        console.log(value.id);
        navigate(`/article/edit/${value.id}`);
    }

    const columns: TableProps<Post>['columns'] = [
        {
            title: '标题',
            dataIndex: 'title',
            key: 'title',
            // 分别为 当前行的值 ， 每一行的数据对象 和 索引
            render: (value, data, i) => <a key={i + data['id']} onClick={() => titleClick(data)}>{value}</a>,
        },
        {
            title: '作者',
            dataIndex: 'author',
            key: 'author',
        },
        {
            title: '是否展示',
            dataIndex: 'is_view',
            key: 'is_view',
            render: (is_view, data, i) => <span key={i + data['id']}>{is_view ?
                <span style={{fontSize: '25px'}}> <EyeOutlined/></span>
                :
                <span style={{fontSize: '25px'}}> <EyeInvisibleOutlined/> </span>
            }</span>
        },
        {
            title: '摘要',
            dataIndex: 'summary',
            key: 'summary',
        },
        {
            title: ' 文章字符数',
            dataIndex: 'word_count',
            key: 'word_count',
        },
        {
            title: '访问量',
            dataIndex: 'visits',
            key: 'visits',
        },
        {
            title: '标签',
            key: 'tags',
            dataIndex: 'tags',
            render: (tags,data,i) => (
                <>
                    {
                        tags
                        &&
                        tags.map((tag) => {
                            return (
                                <Tag color={'volcano'} key={i + data['id']}>
                                    {111}
                                </Tag>
                            );
                        })
                    }
                </>
            ),
        },
        {
            title: '是否允许评论',
            dataIndex: 'disallow_comment',
            key: 'disallow_comment',
            render: (disallow_comment,data,i) => <span key={i + data['id']}>{disallow_comment ? '是' : '否'}</span>
        },
        {
            title: '是否加密',
            dataIndex: 'password',
            key: 'password',
            render: (password,data,i) => <span key={i + data['id']}>{password ? '是' : '否'}</span>
        },
        {
            title: '是否置顶',
            dataIndex: 'top_priority',
            key: 'top_priority',
            render: (top_priority,data,i) => <span key={i + data['id']}>{top_priority ? '是' : '否'}</span>
        },
        {
            title: '创建时间',
            dataIndex: 'created_time',
            key: 'created_time',
            render: (created_time,data,i) => <span key={i + data['id']}>{formatDate(new Date(created_time))}</span>
        },
        {
            title: '更新时间',
            dataIndex: 'update_time',
            key: 'update_time',
            render: (update_time,data,i) => <span key={i + data['id']}>{formatDate(new Date(update_time))}</span>
        },

    ];

    const paginationChange = (index: number, size: number) => {
        console.log(`index : ${index} size: ${size}`);
        pageInfoRef.current.page_num = index;
        pageInfoRef.current.page_size = size;
        getDataList();
    }

    const [postList, setPostList] = useState<Post[]>([]);

    useEffect(() => {
        getDataList();

    }, []);

    function getDataList() {
        setLoading(true);
        PostService.postListPage(pageInfoRef.current).then((result) => {
            const pageInfo: PageInfo = result.obj;
            pageInfoRef.current = pageInfo;
            setPostList([...pageInfo.list]);
            setLoading(false);
        });

    }

    return (
        <>
            <div>
                <Table
                    loading={loading}
                    columns={columns}
                    pagination={{
                        showSizeChanger: true,
                        onChange: paginationChange,
                        total: pageInfoRef.current.total,
                        defaultPageSize: 10
                    }}
                    rowKey={obj => obj.id}
                    dataSource={postList}/>
            </div>
        </>
    );
};