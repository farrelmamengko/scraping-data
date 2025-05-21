# Dokumentasi CI/CD Pipeline Scraper Tender SKK Migas

Dokumen ini menjelaskan detail teknis dari Continuous Integration/Continuous Deployment (CI/CD) pipeline yang digunakan dalam sistem ini, dari pembuatan Docker image hingga deployment di NAS.

## 1. Persiapan Awal

*   **Repository Structure**:
    *   `.github/workflows/`: Berisi file konfigurasi CI/CD
    *   `Dockerfile`: Konfigurasi untuk build Docker image
    *   `docker-compose.yml`: Konfigurasi untuk deployment
    *   `src/`: Source code aplikasi
    *   `migrations/`: File migrasi database

*   **Prerequisites**:
    *   Akun DockerHub
    *   Akses ke NAS (Synology)
    *   GitHub repository
    *   Docker & docker-compose di NAS

## 2. Docker Image Creation

*   **Dockerfile Configuration**:
    ```dockerfile
    FROM node:18-alpine
    WORKDIR /app
    COPY package*.json ./
    RUN npm install
    COPY . .
    EXPOSE 3000
    CMD ["npm", "start"]
    ```

*   **Build Process**:
    *   Base image: `node:18-alpine`
    *   Install dependencies
    *   Copy source code
    *   Expose port 3000
    *   Set startup command

## 3. GitHub Actions Workflow

*   **File**: `.github/workflows/deploy-scraper-app.yml`
*   **Trigger Events**:
    *   Push ke branch `master`
    *   Pull request ke branch `master`
    *   Manual trigger (workflow_dispatch)

## 4. Build & Test Phase

*   **Job**: `build-and-test`
*   **Runner**: `ubuntu-latest`
*   **Steps**:
    1.  **Checkout Code**:
        ```yaml
        - name: Checkout code
          uses: actions/checkout@v4
        ```
    2.  **Setup Docker Buildx**:
        ```yaml
        - name: Set up Docker Buildx
          uses: docker/setup-buildx-action@v3
        ```
    3.  **Login ke DockerHub**:
        ```yaml
        - name: Login to DockerHub
          uses: docker/login-action@v3
          with:
            username: ${{ secrets.DOCKERHUB_USERNAME }}
            password: ${{ secrets.DOCKERHUB_TOKEN }}
        ```
    4.  **Build & Push Image**:
        ```yaml
        - name: Build and push
          uses: docker/build-push-action@v5
          with:
            context: .
            push: true
            tags: farrelmamengko/scraping-data:latest
        ```

## 5. Deploy Phase

*   **Job**: `deploy-to-nas`
*   **Dependencies**: Membutuhkan job `build-and-test` selesai
*   **Steps**:
    1.  **Create docker-compose.yml**:
        ```yaml
        version: '3.8'
        services:
          db:
            image: postgres:14
            environment:
              POSTGRES_DB: skk_tender
              POSTGRES_USER: postgres
              POSTGRES_PASSWORD: postgres123
            volumes:
              - postgres_data:/var/lib/postgresql/data
          
          app:
            image: farrelmamengko/scraping-data:latest
            depends_on:
              - db
            environment:
              - NODE_ENV=production
              - DB_HOST=db
            ports:
              - "3002:3000"
        ```
    2.  **Set NAS Permissions**:
        ```yaml
        - name: Set permissions
          uses: appleboy/ssh-action@master
          with:
            host: ${{ secrets.NAS_HOST }}
            username: ${{ secrets.NAS_USERNAME }}
            password: ${{ secrets.NAS_PASSWORD }}
            script: |
              chmod -R 775 /volume1/docker/skk-tender-staging
        ```
    3.  **Upload Files**:
        ```yaml
        - name: Upload files
          uses: appleboy/scp-action@master
          with:
            host: ${{ secrets.NAS_HOST }}
            username: ${{ secrets.NAS_USERNAME }}
            password: ${{ secrets.NAS_PASSWORD }}
            source: "docker-compose.yml"
            target: "/volume1/docker/skk-tender-staging"
        ```
    4.  **Deploy Containers**:
        ```yaml
        - name: Deploy
          uses: appleboy/ssh-action@master
          with:
            host: ${{ secrets.NAS_HOST }}
            username: ${{ secrets.NAS_USERNAME }}
            password: ${{ secrets.NAS_PASSWORD }}
            script: |
              cd /volume1/docker/skk-tender-staging
              docker-compose pull
              docker-compose up -d
        ```

## 6. Container Configuration

*   **Database Container**:
    *   **Image**: `postgres:14`
    *   **Container Name**: `skk_tender_db`
    *   **Port**: 5434:5432
    *   **Volumes**:
        *   `postgres_data`: Data PostgreSQL
        *   `./migrations`: File migrasi

*   **Application Container**:
    *   **Image**: `farrelmamengko/scraping-data:latest`
    *   **Container Name**: `skk_tender_app`
    *   **Port**: 3002:3000
    *   **Volumes**:
        *   `./data`: Data aplikasi
        *   `./downloaded_pdfs`: PDF yang di-download
        *   `pdf_downloads`: Volume untuk PDF

## 7. Verifikasi Deployment

*   **Health Check**:
    *   Cek status container:
        ```bash
        docker ps
        ```
    *   Cek log aplikasi:
        ```bash
        docker logs skk_tender_app
        ```
    *   Cek koneksi database:
        ```bash
        docker exec skk_tender_db pg_isready
        ```

## 8. Troubleshooting Guide

*   **Build Issues**:
    *   Cek Dockerfile syntax
    *   Verifikasi dependencies
    *   Cek GitHub Actions logs

*   **Deploy Issues**:
    *   Cek NAS connectivity
    *   Verifikasi credentials
    *   Cek disk space di NAS
    *   Cek port availability

*   **Container Issues**:
    *   Cek container logs
    *   Verifikasi volume mounts
    *   Cek environment variables
    *   Restart containers jika perlu

## 9. Maintenance

*   **Regular Tasks**:
    *   Update base images
    *   Backup database
    *   Monitor disk usage
    *   Check container health

*   **Security**:
    *   Rotate credentials
    *   Update dependencies
    *   Monitor access logs
    *   Regular security scans 