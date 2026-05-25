FROM python:3.11-slim

WORKDIR /app

COPY apps/orchestrator/requirements.txt .
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONPATH=/app:/app/packages:/app/agents

CMD ["python", "apps/orchestrator/orchestrator.py"]
