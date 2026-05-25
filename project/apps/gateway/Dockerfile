FROM python:3.11-slim

WORKDIR /app

COPY apps/gateway/requirements.txt .
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements.txt

COPY . .

# Include packages and agents in PYTHONPATH
ENV PYTHONPATH=/app:/app/packages:/app/agents

EXPOSE 8000

CMD ["python", "apps/gateway/main.py"]
