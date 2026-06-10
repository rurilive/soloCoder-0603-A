import { useState, useEffect } from 'react';
import { Card, Button, Row, Col, Rate, Modal, Form, Input, message, Avatar, Space } from 'antd';
import { CheckCircle, XCircle, MessageSquare, RefreshCw } from '@ant-design/icons';
import { reviewApi } from '../../api';

function AdminReviewList() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [visibleReview, setVisibleReview] = useState(null);
  const [replyModalVisible, setReplyModalVisible] = useState(false);
  const [selectedReview, setSelectedReview] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  const [isReplying, setIsReplying] = useState(false);

  useEffect(() => {
    loadReviews();
  }, []);

  const loadReviews = () => {
    setLoading(true);
    reviewApi.getPendingReviews().then((res) => {
      setReviews(res.data);
      setLoading(false);
    }).catch(() => {
      message.error('加载失败');
      setLoading(false);
    });
  };

  const handleApprove = (reviewId) => {
    reviewApi.updateReviewStatus(reviewId, 'approved').then(() => {
      message.success('审核通过');
      loadReviews();
    }).catch(() => {
      message.error('操作失败');
    });
  };

  const handleReject = (reviewId) => {
    reviewApi.updateReviewStatus(reviewId, 'rejected').then(() => {
      message.success('已拒绝');
      loadReviews();
    }).catch(() => {
      message.error('操作失败');
    });
  };

  const handleReply = () => {
    if (!replyContent.trim()) {
      message.error('请输入回复内容');
      return;
    }
    
    setIsReplying(true);
    reviewApi.replyToReview(selectedReview.id, replyContent).then(() => {
      message.success('回复成功');
      setReplyModalVisible(false);
      setReplyContent('');
      setSelectedReview(null);
      setIsReplying(false);
      loadReviews();
    }).catch(() => {
      message.error('回复失败');
      setIsReplying(false);
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const getStatusText = (status) => {
    const statusMap = {
      pending: '待审核',
      approved: '已通过',
      rejected: '已拒绝',
    };
    return statusMap[status] || status;
  };

  const getStatusStyle = (status) => {
    const styleMap = {
      pending: 'bg-yellow-100 text-yellow-600',
      approved: 'bg-green-100 text-green-600',
      rejected: 'bg-red-100 text-red-600',
    };
    return styleMap[status] || 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold">评价审核</h2>
          <Button
            icon={<RefreshCw />}
            onClick={loadReviews}
            loading={loading}
          >
            刷新
          </Button>
        </div>

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-4 px-4 font-semibold">用户信息</th>
                  <th className="text-left py-4 px-4 font-semibold">评分</th>
                  <th className="text-left py-4 px-4 font-semibold">评价内容</th>
                  <th className="text-left py-4 px-4 font-semibold">酒店</th>
                  <th className="text-left py-4 px-4 font-semibold">提交时间</th>
                  <th className="text-left py-4 px-4 font-semibold">状态</th>
                  <th className="text-center py-4 px-4 font-semibold">操作</th>
                </tr>
              </thead>
              <tbody>
                {reviews.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-500">
                      暂无待审核评价
                    </td>
                  </tr>
                ) : (
                  reviews.map((review) => (
                    <tr key={review.id} className="border-b hover:bg-gray-50">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="bg-blue-500">
                            {review.order?.guest_name?.charAt(0) || 'U'}
                          </Avatar>
                          <div>
                            <p className="font-medium">{review.order?.guest_name || '匿名用户'}</p>
                            <p className="text-sm text-gray-500">{review.order?.guest_phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <Rate disabled value={review.rating} className="text-yellow-500" />
                      </td>
                      <td className="py-4 px-4 max-w-xs">
                        <p 
                          className="truncate cursor-pointer hover:text-blue-500"
                          onClick={() => setVisibleReview(review)}
                        >
                          {review.comment || '-'}
                        </p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="font-medium">{review.order?.hotel?.name || '-'}</p>
                      </td>
                      <td className="py-4 px-4">
                        <p className="text-sm text-gray-500">{formatDate(review.created_at)}</p>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`text-sm px-3 py-1 rounded-full ${getStatusStyle(review.status)}`}>
                          {getStatusText(review.status)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <Space>
                          {review.status === 'pending' && (
                            <>
                              <Button
                                type="primary"
                                size="small"
                                icon={<CheckCircle />}
                                onClick={() => handleApprove(review.id)}
                              >
                                通过
                              </Button>
                              <Button
                                danger
                                size="small"
                                icon={<XCircle />}
                                onClick={() => handleReject(review.id)}
                              >
                                拒绝
                              </Button>
                            </>
                          )}
                          {review.status === 'approved' && (
                            <Button
                              size="small"
                              icon={<MessageSquare />}
                              onClick={() => {
                                setSelectedReview(review);
                                setReplyModalVisible(true);
                              }}
                            >
                              回复
                            </Button>
                          )}
                        </Space>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Modal
          title="评价详情"
          visible={!!visibleReview}
          footer={null}
          onCancel={() => setVisibleReview(null)}
          width={600}
        >
          {visibleReview && (
            <div>
              <div className="flex items-center gap-4 mb-6">
                <Avatar className="bg-blue-500 text-xl">
                  {visibleReview.order?.guest_name?.charAt(0) || 'U'}
                </Avatar>
                <div>
                  <p className="font-bold text-lg">{visibleReview.order?.guest_name || '匿名用户'}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Rate disabled value={visibleReview.rating} />
                    <span className="text-gray-500 text-sm">{formatDate(visibleReview.created_at)}</span>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-600">{visibleReview.comment}</p>
              </div>
              {visibleReview.reply && (
                <div className="mt-4 bg-green-50 p-4 rounded-lg">
                  <p className="font-bold text-green-800 mb-2">酒店回复：</p>
                  <p className="text-green-700">{visibleReview.reply}</p>
                  <p className="text-green-500 text-sm mt-2">{formatDate(visibleReview.reply_at)}</p>
                </div>
              )}
            </div>
          )}
        </Modal>

        <Modal
          title="回复评价"
          visible={replyModalVisible}
          footer={null}
          onCancel={() => {
            setReplyModalVisible(false);
            setReplyContent('');
            setSelectedReview(null);
          }}
          width={600}
        >
          {selectedReview && (
            <div>
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm mb-2">用户评价：</p>
                <p className="text-gray-700">{selectedReview.comment}</p>
              </div>
              <Form.Item label="回复内容">
                <Input.TextArea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="请输入回复内容..."
                  rows={4}
                />
              </Form.Item>
              <div className="flex justify-end gap-4">
                <Button onClick={() => {
                  setReplyModalVisible(false);
                  setReplyContent('');
                  setSelectedReview(null);
                }}>
                  取消
                </Button>
                <Button
                  type="primary"
                  onClick={handleReply}
                  loading={isReplying}
                >
                  发送回复
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}

export default AdminReviewList;