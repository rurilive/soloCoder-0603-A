from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from .database import Base


class SpiderScript(Base):
    __tablename__ = "spider_scripts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    code = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tasks = relationship("SpiderTask", back_populates="script", cascade="all, delete-orphan")


class SpiderTask(Base):
    __tablename__ = "spider_tasks"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    script_id = Column(Integer, ForeignKey("spider_scripts.id"), nullable=False)
    cleaning_pipeline_id = Column(Integer, ForeignKey("cleaning_pipelines.id"), nullable=True)
    cron_expression = Column(String(100), default="")
    is_enabled = Column(Boolean, default=True)
    scrape_rules = Column(JSON, default=dict)
    timeout = Column(Integer, default=60)
    max_retries = Column(Integer, default=3)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    script = relationship("SpiderScript", back_populates="tasks")
    cleaning_pipeline = relationship("CleaningPipeline", back_populates="tasks")
    jobs = relationship("SpiderJob", back_populates="task", cascade="all, delete-orphan")


class SpiderJob(Base):
    __tablename__ = "spider_jobs"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("spider_tasks.id"), nullable=False)
    execution_id = Column(String(100), default="", index=True)
    retry_count = Column(Integer, default=0)
    status = Column(String(50), default="pending")
    started_at = Column(DateTime, default=datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    duration = Column(Integer, default=0)
    items_scraped = Column(Integer, default=0)
    error_message = Column(Text, default="")

    task = relationship("SpiderTask", back_populates="jobs")
    results = relationship("SpiderResult", back_populates="job", cascade="all, delete-orphan")


class SpiderResult(Base):
    __tablename__ = "spider_results"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("spider_jobs.id"), nullable=False)
    url = Column(String(2048), default="")
    data = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)

    job = relationship("SpiderJob", back_populates="results")


class VisualCrawlConfig(Base):
    __tablename__ = "visual_crawl_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    crawl_type = Column(String(50), nullable=False)
    list_config = Column(JSON, default=dict)
    detail_config = Column(JSON, default=dict)
    common_config = Column(JSON, default=dict)
    generated_script_id = Column(Integer, ForeignKey("spider_scripts.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    generated_script = relationship("SpiderScript", foreign_keys=[generated_script_id])


class DebugSession(Base):
    __tablename__ = "debug_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(100), unique=True, index=True, nullable=False)
    script_id = Column(Integer, ForeignKey("spider_scripts.id"), nullable=True)
    code = Column(Text, nullable=False)
    scrape_rules = Column(JSON, default=dict)
    status = Column(String(50), default="idle")
    current_line = Column(Integer, default=0)
    breakpoints = Column(JSON, default=list)
    variables = Column(JSON, default=dict)
    output = Column(JSON, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    script = relationship("SpiderScript")


class CleaningPipeline(Base):
    __tablename__ = "cleaning_pipelines"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    rules = relationship(
        "CleaningRule",
        back_populates="pipeline",
        cascade="all, delete-orphan",
        order_by="CleaningRule.order_index"
    )
    tasks = relationship("SpiderTask", back_populates="cleaning_pipeline")


class CleaningRule(Base):
    __tablename__ = "cleaning_rules"

    id = Column(Integer, primary_key=True, index=True)
    pipeline_id = Column(Integer, ForeignKey("cleaning_pipelines.id"), nullable=False)
    rule_type = Column(String(50), nullable=False)
    field_name = Column(String(255), default="")
    params = Column(JSON, default=dict)
    order_index = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    pipeline = relationship("CleaningPipeline", back_populates="rules")
