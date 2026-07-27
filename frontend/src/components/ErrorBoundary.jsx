import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
        return (<div>
            <h2>Đã có lỗi xảy ra!</h2>
            <p>Không thể kết nối đến máy chủ hoặc có sự cố hệ thống.</p>
            <button onClick={() => window.location.reload()}>Tải lại trang</button>
        </div>);
    }
        return this.props.children;
    }
}

export default ErrorBoundary;
