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
    cron_expression = Column(String(100), default="")
    is_enabled = Column(Boolean, default=True)
    scrape_rules = Column(JSON, default=dict)
    timeout = Column(Integer, default=60)
    max_retries = Column(Integer, default=3)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    script = relationship("SpiderScript", back_populates="tasks")
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
